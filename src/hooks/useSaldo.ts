import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getBalance, getLedger, getPayouts, getPaymentConfig, requestPayout,
  type RequestPayoutInput,
} from "@/services/saldoService";

export const saldoKeys = {
  all: ["saldo"] as const,
  balance: () => ["saldo", "balance"] as const,
  ledger: () => ["saldo", "ledger"] as const,
  payouts: () => ["saldo", "payouts"] as const,
  config: () => ["saldo", "config"] as const,
};

export function useBalance() {
  return useQuery({ queryKey: saldoKeys.balance(), queryFn: getBalance });
}

export function useLedger() {
  return useQuery({ queryKey: saldoKeys.ledger(), queryFn: () => getLedger(50) });
}

export function usePayouts() {
  return useQuery({ queryKey: saldoKeys.payouts(), queryFn: getPayouts });
}

export function usePaymentConfig() {
  return useQuery({ queryKey: saldoKeys.config(), queryFn: getPaymentConfig, staleTime: 5 * 60_000 });
}

export function useRequestPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestPayoutInput) => requestPayout(input),
    onSuccess: () => {
      // A payout holds funds immediately, so the balance, ledger, and history all move.
      qc.invalidateQueries({ queryKey: saldoKeys.balance() });
      qc.invalidateQueries({ queryKey: saldoKeys.ledger() });
      qc.invalidateQueries({ queryKey: saldoKeys.payouts() });
    },
  });
}
