import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { formatDate, formatTime } from "@shared/dates";
import { formatKes } from "@shared/money";
import type { SaleDto } from "@shared/schemas";
import { ApiError, api } from "@web/api/client";
import { salesApi } from "@web/api/sales";
import { FullPageSpinner } from "@web/components/FullPageSpinner";
import { Button } from "@web/components/fields";

interface Shop {
  name: string;
  address: string;
  phone: string;
  footer: string;
}

export function ReceiptPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sale, setSale] = useState<SaleDto | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoPrint = searchParams.get("print") === "1";

  useEffect(() => {
    let cancelled = false;
    Promise.all([salesApi.get(id), api.get<{ shop: Shop }>("/shop")])
      .then(([saleRes, shopRes]) => {
        if (cancelled) return;
        setSale(saleRes.sale);
        setShop(shopRes.shop);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load the receipt",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Printing straight from the sell screen skips a click for the cashier.
  useEffect(() => {
    if (autoPrint && sale && shop) {
      const timer = setTimeout(() => window.print(), 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoPrint, sale, shop]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">{error}</p>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    );
  }

  if (!sale || !shop) return <FullPageSpinner />;

  const cashPayments = sale.payments.filter((p) => p.method === "cash");
  const totalTendered = cashPayments.reduce(
    (sum, p) => sum + (p.tenderedCents ?? 0),
    0,
  );
  const totalChange = cashPayments.reduce(
    (sum, p) => sum + (p.changeCents ?? 0),
    0,
  );
  const voided = sale.status === "voided";
  const refunded =
    sale.status === "refunded" || sale.status === "partially_refunded";

  return (
    <div className="min-h-full bg-slate-200 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[72mm] gap-2">
        <Button onClick={() => navigate(-1)} className="flex-1">
          Back
        </Button>
        <Button
          variant="primary"
          onClick={() => window.print()}
          className="flex-1"
        >
          Print
        </Button>
      </div>

      <div className="receipt mx-auto bg-white p-4 shadow-lg print:shadow-none">
        <header className="text-center">
          <h1 className="text-base font-bold tracking-wide uppercase">
            {shop.name}
          </h1>
          {shop.address && <p>{shop.address}</p>}
          {shop.phone && <p>{shop.phone}</p>}
        </header>

        {(voided || refunded) && (
          <p className="mt-2 border-2 border-black py-1 text-center text-sm font-bold tracking-widest">
            {voided ? "VOIDED" : "REFUNDED"}
          </p>
        )}

        <div className="receipt-rule" />

        <div className="flex justify-between">
          <span>Receipt</span>
          <span className="font-bold">{sale.saleNo}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{formatDate(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Time</span>
          <span>{formatTime(sale.createdAt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Served by</span>
          <span>{sale.cashierName}</span>
        </div>

        <div className="receipt-rule" />

        <ul>
          {sale.items.map((item) => (
            <li key={item.id} className="mb-1">
              <div className="break-words">{item.name}</div>
              <div className="flex justify-between">
                <span>
                  {item.qty} x {formatKes(item.unitPriceCents)}
                </span>
                <span>{formatKes(item.qty * item.unitPriceCents)}</span>
              </div>
              {item.discountCents > 0 && (
                <div className="flex justify-between">
                  <span> Discount</span>
                  <span>-{formatKes(item.discountCents)}</span>
                </div>
              )}
              {item.refundedQty > 0 && (
                <div className="flex justify-between">
                  <span> Refunded</span>
                  <span>{item.refundedQty}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="receipt-rule" />

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatKes(sale.subtotalCents)}</span>
        </div>
        {sale.discountCents > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{formatKes(sale.discountCents)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold">
          <span>TOTAL</span>
          <span>{formatKes(sale.totalCents)}</span>
        </div>

        <div className="receipt-rule" />

        {sale.payments.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>
              {p.method === "cash" ? "Cash" : "M-Pesa"}
              {p.mpesaCode ? ` ${p.mpesaCode}` : ""}
            </span>
            <span>{formatKes(p.amountCents)}</span>
          </div>
        ))}

        {totalTendered > 0 && (
          <>
            <div className="flex justify-between">
              <span>Cash tendered</span>
              <span>{formatKes(totalTendered)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Change</span>
              <span>{formatKes(totalChange)}</span>
            </div>
          </>
        )}

        {sale.note && (
          <>
            <div className="receipt-rule" />
            <p className="break-words">{sale.note}</p>
          </>
        )}

        <div className="receipt-rule" />

        <footer className="text-center">
          {shop.footer && <p>{shop.footer}</p>}
          <p className="mt-1">{sale.saleNo}</p>
        </footer>
      </div>
    </div>
  );
}
