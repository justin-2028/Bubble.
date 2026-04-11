# Bubble.

I was so tired of using clunky CRMs, tables & spreadsheets. 

I needed an aesthetically pleasing way to visualize my involvement in the social circles I care deeply about. 

So, this is what I made, **for myself**.<br/><br/>

<p align="center">
  <img width="1728" height="905" alt="bubbleexample" src="https://github.com/user-attachments/assets/17afcf80-25c9-4537-b0af-53418c8a5cdd" />
</p>
<div align="center">
  Above: My "TMNT" friend group visualized in Bubble.
</div>

## Hosted Mode

Bubble now supports a private hosted mode instead of relying on `localhost:3000`:

- Secure cookie login for a single private owner
- Server-backed Bubble state for cross-device access
- Helper API tokens for a future local Mac companion
- Self-hosted fonts via `next/font`

Set up the env vars from `.env.example` before using hosted auth. For Vercel deployments, add `BLOB_READ_WRITE_TOKEN` to persist Bubble state remotely; otherwise the app falls back to a local JSON file in `.bubble-data/` for development.

Generate a password hash with:

```bash
npm run auth:hash -- "your-password"
```

## Future Mac Helper Boundary

The local Mac helper now lives in [`mac-helper`](./mac-helper). It is designed to keep all sensitive iMessage identifiers on-device and send only minimal Bubble-safe updates to the hosted app, such as:

- Bubble import metadata you explicitly approve
- Helper-authenticated `lastInteraction` updates
- No message bodies or raw contact handles stored in Bubble itself

See [`mac-helper/README.md`](./mac-helper/README.md) for build/run instructions, permissions, and the privacy boundary.
