import { storeInvoiceIncreaseCredits } from '../../lib/db';
import { centsToCredits } from '../../lib/pricing';
import { invoicePaymentReceived } from '../../stream/wschat';
import { Request, Response } from 'express';
const stripe = require('stripe')(process.env.STRIPE_PK);
const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;

const cache: Record<string, { invoice: string; client_reference_id: string }> =
  {};

export function stripeCallbackHandler(request: Request, response: Response) {
  const payload = request.body;
  const sig = request.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    console.log(new Date(), event.type);
    if (event.type === 'checkout.session.completed') {
      if (event.data.object.invoice) {
        cache[event.data.object.invoice] = {
          client_reference_id: event.data.object.client_reference_id,
          invoice: event.data.object.invoice,
        };
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      if (cache[event.data.object.id]) {
        const { invoice, client_reference_id } = cache[event.data.object.id];
        storeInvoiceIncreaseCredits({
          credits: centsToCredits(event.data.object.subtotal_excluding_tax),
          invoice_id: invoice,
          tenant_id: client_reference_id,
        })
          .then((remaining) => {
            invoicePaymentReceived({
              tenantId: client_reference_id,
              credits: parseInt(remaining.credits),
            });
          })
          .catch((e) => {
            console.error(new Date(), 'error storing invoice payment', e);
          });
      }
    }
  } catch (err) {
    console.error('webhook error', err);
    if (err) {
      return (
        response
          .status(400)
          // @ts-ignore
          .send(`Webhook Error: ${err.message}`)
      );
    }
  }

  response.status(200).end();
}
