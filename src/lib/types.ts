export type TxKind = "income" | "expense";
export type ExpenseStatus = "scheduled" | "executed";

export type Account = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  kind: TxKind;
};

export type Attachment = {
  id: string;
  transaction_id: string;
  storage_path: string | null;
  external_url: string | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: TxKind;
  description: string;
  amount: number;
  payment_method: string | null;
  created_at: string;

  // novos campos (para saídas)
  expense_status?: ExpenseStatus | null; // scheduled/executed (só para expense)
  executed_at?: string | null;

  category_id: string;
  account_id: string;

  categories?: { name: string; kind: TxKind } | null;
  accounts?: { name: string } | null;
  attachments?: Attachment[] | null;
};