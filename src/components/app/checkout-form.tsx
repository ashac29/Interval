"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { placeOrderAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { Flavor, OfferId } from "@/config/products";

export function CheckoutForm({ offer, mix }: { offer: OfferId; mix: Record<Flavor, number> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await placeOrderAction(offer, mix, name, city);
          if (r.ok && "orderId" in r && r.orderId) router.push(`/shop/confirmation?o=${r.orderId}`);
          else toast.error(r.ok ? "Something went wrong." : r.error);
        });
      }}
    >
      <Field label="Name (for the simulated label)" htmlFor="co-name"><Input id="co-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></Field>
      <Field label="City (simulated shipping)" htmlFor="co-city" hint="No real address is collected."><Input id="co-city" required maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" /></Field>
      <Button size="lg" type="submit" disabled={pending || !name.trim() || !city.trim()} aria-busy={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Place simulated order
      </Button>
    </form>
  );
}
