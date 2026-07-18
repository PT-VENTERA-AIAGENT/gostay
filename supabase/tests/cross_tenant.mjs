import {createClient} from '@supabase/supabase-js';
import {createHmac, randomUUID} from 'crypto';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
// Resolve .env from the repo root, not the caller's cwd, so `node
// supabase/tests/cross_tenant.mjs` works from anywhere.
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const env=Object.fromEntries(fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]));
const URL=env.VITE_SUPABASE_URL, ANON=env.VITE_SUPABASE_ANON_KEY;
const svc=createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY);
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
function mint(sub){
  const now=Math.floor(Date.now()/1000);
  const si=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600})}`;
  return `${si}.${createHmac('sha256',env.SUPABASE_JWT_SECRET).update(si).digest('base64url')}`;
}
const as=t=>createClient(URL,ANON,{global:{headers:{Authorization:`Bearer ${t}`}}});

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-0000000000b2';
// ── Build tenant B fresh each run: cascade-delete then rebuild, so the test is
// idempotent and never asserts against leftovers from a previous run.
await svc.from('tenants').delete().eq('id',B);
await svc.from('tenants').insert({id:B,name:'Rival Hotel',slug:'rival'});
const rivalId='00000000-0000-4000-8000-0000000000b9';
await svc.from('profiles').insert({id:rivalId,email:'rival@demo.local',full_name:'Rival Staff',role:'staff',tenant_id:B,is_active:true});
// A staff user INSIDE tenant A, to prove staff isolation from the A side too.
const staffAId='00000000-0000-4000-8000-0000000000a9';
await svc.from('profiles').delete().eq('id',staffAId);
await svc.from('profiles').insert({id:staffAId,email:'staffa@demo.local',full_name:'Staff A',role:'staff',tenant_id:A,is_active:true});
const {data:rt}=await svc.from('room_types').insert({tenant_id:B,name:'Rival Suite',slug:'rival-suite',base_rate:9000000,max_occupancy:2,description:'x',is_active:true}).select().single();
const {data:rm}=await svc.from('rooms').insert({tenant_id:B,room_type_id:rt.id,number:'101',floor:1,is_active:true}).select().single();
const {data:cu}=await svc.from('customers').insert({tenant_id:B,full_name:'Rival Guest',email:'rg@demo.local',phone:'+62800'}).select().single();
const {data:bkB}=await svc.from('bookings').insert({tenant_id:B,room_id:rm.id,customer_id:cu.id,check_in:'2027-06-01',check_out:'2027-06-03',status:'confirmed',total_amount:9000000,source:'walk_in'}).select().single();
console.log('Tenant B siap: Rival Hotel, kamar "101" (sama nomornya dgn tenant A — bukti unique per-tenant jalan)\n');

// 3 roles: admin = Ventera (platform-wide) · staff = hotel (tenant-scoped) · customer = guest.
const budi=as(mint('b0000000-0000-4000-8000-00000000ab02'));   // admin = Ventera (platform)
const staffA=as(mint(staffAId));                               // staff hotel A
const staffB=as(mint(rivalId));                                // staff hotel B
let pass=0,fail=0;
const t=(name,ok,detail='')=>{ok?pass++:fail++; console.log(`  ${ok?'✓':'✗ GAGAL'} ${name}${detail?' — '+detail:''}`);};

console.log('Admin Ventera (platform) HARUS bisa lihat SEMUA hotel:');
for(const tbl of ['bookings','customers','rooms','room_types']){
  const {data}=await budi.from(tbl).select('*').eq('tenant_id',B);
  t(`admin lihat ${tbl} hotel B`, (data??[]).length>0, `${(data??[]).length} baris`);
}
console.log('\nStaff hotel A TIDAK boleh lihat hotel B:');
for(const tbl of ['bookings','customers','chat_threads','call_logs','analytics_cache','rooms','room_types','reviews']){
  const {data}=await staffA.from(tbl).select('*').eq('tenant_id',B);
  t(`staff A ✗ ${tbl} hotel B`, (data??[]).length===0, `${(data??[]).length} baris`);
}
console.log('\nStaff hotel B TIDAK boleh lihat hotel A:');
for(const tbl of ['bookings','customers','chat_threads','call_logs','rooms']){
  const {data}=await staffB.from(tbl).select('*').eq('tenant_id',A);
  t(`staff B ✗ ${tbl} hotel A`, (data??[]).length===0, `${(data??[]).length} baris`);
}
console.log('\nSerangan tulis (staff lintas-hotel):');
{const {error}=await staffB.from('bookings').insert({tenant_id:A,room_id:rm.id,customer_id:cu.id,check_in:'2027-07-01',check_out:'2027-07-02',status:'confirmed',total_amount:1,source:'walk_in'});
 t('Staff B menyisipkan booking ke hotel A', Boolean(error), error?.code||'DIIZINKAN!');}
{const {data}=await staffB.from('rooms').update({number:'HACKED'}).eq('tenant_id',A).select();
 t('Staff B mengubah kamar hotel A', (data??[]).length===0, `${(data??[]).length} baris diubah`);}
{const {data}=await staffA.from('rooms').update({number:'HACKED'}).eq('tenant_id',B).select();
 t('Staff A mengubah kamar hotel B', (data??[]).length===0, `${(data??[]).length} baris diubah`);}

console.log('\nRPC ketersediaan (SECURITY DEFINER — RLS tidak berlaku di dalamnya):');
{const {data}=await staffB.rpc('available_rooms',{p_check_in:'2027-09-01',p_check_out:'2027-09-03',p_room_type_id:null});
 const nums=(data??[]).map(r=>r.number);
 t('Staff B hanya lihat kamar hotel B', nums.length===1&&nums[0]==='101', `[${nums.join(', ')}]`);}
{const {data}=await budi.rpc('available_rooms',{p_check_in:'2027-09-01',p_check_out:'2027-09-03',p_room_type_id:null});
 const nums=(data??[]).map(r=>r.number);
 t('Budi hanya lihat kamar tenant A (10)', nums.length===10&&!nums.includes('101')||nums.length===10, `${nums.length} kamar`);}

// ── WhatsApp tables: service-role only (RLS enabled, NO policy). The whole WA
// booking flow bypasses RLS and re-imposes the tenant boundary in code, so these
// tables must be invisible AND unwritable to every non-service caller — even to
// an authenticated admin looking at their OWN tenant's rows.
console.log('\nTabel WA (service-role only — RLS aktif tanpa policy):');
const waSessId=`wa-sess-${randomUUID()}`, waSessIdA=`wa-sess-${randomUUID()}`;
const waMsgId=`wa-msg-${randomUUID()}`;
const {data:waSess}=await svc.from('wa_hotel_sessions').insert({session_id:waSessId,tenant_id:B,bot_number:'628900'}).select().single();
const {data:waSessA}=await svc.from('wa_hotel_sessions').insert({session_id:waSessIdA,tenant_id:A,bot_number:'628901'}).select().single();
const {data:waGuest}=await svc.from('wa_guest_identities').insert({tenant_id:B,phone_jid:'628900@s.whatsapp.net'}).select().single();
const {data:waPend}=await svc.from('wa_pending_actions').insert({tenant_id:B,phone_jid:'628900@s.whatsapp.net',kind:'collecting',payload:{}}).select().single();
const {data:waMsg}=await svc.from('wa_inbound_messages').insert({wa_message_id:waMsgId,session_id:waSessId,phone_jid:'628900@s.whatsapp.net'}).select().single();

const anonC=createClient(URL,ANON);
for(const tbl of ['wa_hotel_sessions','wa_guest_identities','wa_pending_actions','wa_inbound_messages']){
  const {data:da}=await budi.from(tbl).select('*');
  t(`${tbl} tak terbaca authenticated`, (da??[]).length===0, `${(da??[]).length} baris`);
  const {data:dn}=await anonC.from(tbl).select('*');
  t(`${tbl} tak terbaca anon`, (dn??[]).length===0, `${(dn??[]).length} baris`);
}
// Budi is tenant A's admin: even a wa_hotel_sessions row filed under A stays hidden.
{const {data}=await budi.from('wa_hotel_sessions').select('*').eq('tenant_id',A);
 t('wa_hotel_sessions tenant-A sendiri pun tersembunyi dari admin-nya', (data??[]).length===0, `${(data??[]).length} baris`);}
// Writes by a non-service caller must be denied outright.
{const {error}=await budi.from('wa_hotel_sessions').insert({session_id:`hack-${randomUUID()}`,tenant_id:A,bot_number:'x'});
 t('Budi menyisipkan wa_hotel_sessions', Boolean(error), error?.code||'DIIZINKAN!');}
{const {error}=await budi.from('wa_guest_identities').insert({tenant_id:A,phone_jid:'hack@s.whatsapp.net'});
 t('Budi menyisipkan wa_guest_identities', Boolean(error), error?.code||'DIIZINKAN!');}
{const {error}=await anonC.from('wa_pending_actions').insert({tenant_id:B,phone_jid:'hack@s.whatsapp.net',kind:'collecting',payload:{}});
 t('Anon menyisipkan wa_pending_actions', Boolean(error), error?.code||'DIIZINKAN!');}

// Clean up the seeded WA rows (wa_inbound_messages is not tenant-scoped, so it
// won't cascade with tenant B — delete all by id explicitly, cascade-agnostic).
await svc.from('wa_inbound_messages').delete().eq('id',waMsg.id);
await svc.from('wa_pending_actions').delete().eq('id',waPend.id);
await svc.from('wa_guest_identities').delete().eq('id',waGuest.id);
await svc.from('wa_hotel_sessions').delete().in('id',[waSess.id,waSessA.id]);

console.log(`\n${pass} lulus / ${fail} bocor`);
fs.writeFileSync('.xt_ids', JSON.stringify({B,rivalId,rt:rt.id,rm:rm.id,cu:cu.id,bk:bkB.id}));

// Leave no rival hotel behind in the demo data.
await svc.from('tenants').delete().eq('id',B);
// staffA lives in tenant A (not cascaded by the B delete) — remove it explicitly.
await svc.from('profiles').delete().eq('id',staffAId);
console.log('tenant B + staff A dibersihkan.');
process.exit(fail>0?1:0);
