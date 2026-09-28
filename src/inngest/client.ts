import {
  Inngest,
} from "inngest";

/*
 * Shared Inngest client for ÉLAN backend.
 *
 * If your project already has an Inngest client,
 * keep the existing one and do not create a second client.
 */
export const inngest =
  new Inngest({
    id:
      "elan-parfums-backend",
  });
