"use client";

export function PrintReceiptButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-11 rounded-lg bg-[#153c33] px-4 font-semibold text-white"
    >
      Print receipt
    </button>
  );
}
