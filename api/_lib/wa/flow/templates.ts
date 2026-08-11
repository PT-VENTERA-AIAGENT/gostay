// Shared with the browser-side flow editor. Keeping this compatibility export
// lets the WhatsApp engine and its tests retain their local import paths while
// Vercel dev serves the implementation from src/ instead of mistaking it for
// an /api function request.
export * from "../../../../src/lib/waFlowTemplates";
