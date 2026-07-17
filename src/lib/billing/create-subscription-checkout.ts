"use client";

import {
  BILLING_CURRENCY,
  type BillingCycleMonths,
} from "@/lib/billing/pricing";
import { getClientWompiEnvironment } from "@/lib/billing/wompi-config";

export type SubscriptionPlanId = "advisor-monthly";

export interface CreateCheckoutParams {
  planId?: SubscriptionPlanId;
  /** Número de asesores / asientos a facturar. */
  seats: number;
  /** Ciclo de facturación en meses (1, 3, 6 o 12). */
  billingCycle: BillingCycleMonths;
}

export interface WompiCheckoutPayload {
  reference: string;
  amount_in_cents: number;
  signature: string;
  environment?: "sandbox" | "production";
  currency?: string;
}

export class CheckoutRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CheckoutRequestError";
    this.status = status;
  }
}

/** Ruta interna donde un admin autenticado completa la suscripción. */
export const BILLING_SUBSCRIBE_PATH = "/billing/subscribe";

const WOMPI_WIDGET_SCRIPT = "https://checkout.wompi.co/widget.js";

declare global {
  interface Window {
    WidgetCheckout?: new (config: {
      currency: string;
      amountInCents: number;
      reference: string;
      publicKey: string;
      signature: { integrity: string };
      redirectUrl?: string;
    }) => {
      open: (
        callback: (result: { transaction: { status: string } }) => void,
      ) => void;
    };
  }
}

function loadWompiWidgetScript(): Promise<void> {
  if (window.WidgetCheckout) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${WOMPI_WIDGET_SCRIPT}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("WOMPI_WIDGET_LOAD_FAILED")),
        { once: true },
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WOMPI_WIDGET_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("WOMPI_WIDGET_LOAD_FAILED"));
    document.body.appendChild(script);
  });
}

/**
 * Solicita al backend la creación de una transacción `pending` y la
 * firma de integridad Wompi para el widget.
 */
export async function createSubscriptionCheckout(
  params: CreateCheckoutParams,
): Promise<WompiCheckoutPayload> {
  const response = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      seats: params.seats,
      billingCycle: params.billingCycle,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | WompiCheckoutPayload
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new CheckoutRequestError(
      body && "error" in body && body.error
        ? body.error
        : "No se pudo iniciar el checkout",
      response.status,
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("reference" in body) ||
    !("amount_in_cents" in body) ||
    !("signature" in body)
  ) {
    throw new CheckoutRequestError("Respuesta de checkout inválida", 500);
  }

  return body as WompiCheckoutPayload;
}

/** Abre el Web Checkout widget de Wompi con los datos firmados por el backend. */
export async function openWompiCheckout(
  payload: WompiCheckoutPayload,
): Promise<void> {
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("NEXT_PUBLIC_WOMPI_PUBLIC_KEY is not configured");
  }

  await loadWompiWidgetScript();

  if (!window.WidgetCheckout) {
    throw new Error("WOMPI_WIDGET_UNAVAILABLE");
  }

  const checkout = new window.WidgetCheckout({
    currency: BILLING_CURRENCY,
    amountInCents: payload.amount_in_cents,
    reference: payload.reference,
    publicKey,
    signature: { integrity: payload.signature },
  });

  return new Promise((resolve, reject) => {
    checkout.open((result) => {
      const status = result.transaction?.status?.toUpperCase();
      if (status === "APPROVED" || status === "PENDING") {
        resolve();
        return;
      }
      const isSandbox =
        payload.environment === "sandbox" ||
        getClientWompiEnvironment() === "sandbox";
      const sandboxHint = isSandbox
        ? " En sandbox use 4242…4242 (aprobada) o 4111…1111 (declinada)."
        : "";
      reject(new Error(`${status ?? "PAYMENT_NOT_COMPLETED"}${sandboxHint}`));
    });
  });
}
