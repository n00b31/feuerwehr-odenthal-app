import assert from "node:assert/strict";
import { createECDH,randomBytes } from "node:crypto";
import webpush from "npm:web-push@3.6.7";
import ece from "npm:http_ece@1.2.0";

Deno.test("real VAPID and aes128gcm request round-trips with ephemeral synthetic keys without contacting a Push service",()=>{
  const vapid=webpush.generateVAPIDKeys(),receiver=createECDH("prime256v1");
  receiver.generateKeys();
  const auth=randomBytes(16),payload=JSON.stringify({format:1,
    notification_id:"a0700000-0000-4000-8000-000000000001",delivery_id:"b0700000-0000-4000-8000-000000000001"});
  const details=webpush.generateRequestDetails({endpoint:"https://fcm.googleapis.com/fcm/send/synthetic-ci",
    keys:{p256dh:receiver.getPublicKey().toString("base64url"),auth:auth.toString("base64url")}},payload,{
      TTL:300,urgency:"normal",topic:"b0700000000040008000000000000001",contentEncoding:"aes128gcm",
      vapidDetails:{subject:"https://n00b31.github.io/feuerwehr-odenthal-app/",publicKey:vapid.publicKey,privateKey:vapid.privateKey},
    });
  assert.match(details.headers.Authorization,/^vapid t=/);
  assert.equal(details.headers["Content-Encoding"],"aes128gcm");
  assert.equal(details.body.includes(Buffer.from(payload)),false);
  const plaintext=ece.decrypt(details.body,{version:"aes128gcm",privateKey:receiver,authSecret:auth});
  assert.equal(plaintext.toString(),payload);
  assert.equal(new Uint8Array(details.body).buffer.byteLength,details.body.byteLength);
});
