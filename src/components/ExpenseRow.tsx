import type { ExpenseRow as ExpenseRowType } from "../types";

type Props = {
  row: ExpenseRowType;
  removable: boolean;
  onChange: (row: ExpenseRowType) => void;
  onRemove: () => void;
};

export function ExpenseRow({ row, removable, onChange, onRemove }: Props) {
  return (
    <div className="expense-row">
      <input
        className="input"
        placeholder="Expense name"
        value={row.name}
        onChange={(e) => onChange({ ...row, name: e.target.value })}
      />
      <input
        className="input amount-input"
        placeholder="0.00"
        value={row.amount}
        inputMode="decimal"
        onChange={(e) => onChange({ ...row, amount: e.target.value })}
      />
      {removable ? (
        <button className="remove-btn" onClick={onRemove} type="button" aria-label="Remove expense">
          x
        </button>
      ) : null}
    </div>
  );
}
