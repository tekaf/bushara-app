import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function isStripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

export function getStripeServerClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (stripeInstance) return stripeInstance
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
  })
  return stripeInstance
}

