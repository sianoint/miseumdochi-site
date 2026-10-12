import { handleSubscribe } from '../../lib/subscribe.mjs';
export function onRequest(context) { return handleSubscribe(context.request, context.env); }
