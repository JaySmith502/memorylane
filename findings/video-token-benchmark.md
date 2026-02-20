# Video Input Token Benchmark

**Date:** 2026-02-20 | **Platform:** OpenRouter API | **Input:** 16s screen recording, 1 fps, 3024x1964, H.264 MP4 (1.6 MB, 18 frames)

## Methodology

1. Recorded a 16s screen recording (.mov, 40 fps) and converted to 1 fps MP4:
   ```bash
   ffmpeg -i input.mov -r 1 -c:v libx264 -pix_fmt yuv420p -an output.mp4
   ```
2. Base64-encoded the MP4 and sent it to each model via OpenRouter's `/api/v1/chat/completions` endpoint with a simple prompt ("Describe this video in one sentence") and `max_tokens: 50`.
3. Recorded `prompt_tokens` from the response `usage` object.

**Gotcha:** OpenRouter requires `video_url` content type for video, not `image_url`. Using `image_url` with video data silently fails on non-Gemini models (Gemini happens to accept both).

## Results

| Model                                            | Input Tokens | Tokens/Frame | Status |
| ------------------------------------------------ | ------------ | ------------ | ------ |
| **google/gemini-3-flash-preview**                | **1,159**    | ~64          | Works  |
| **allenai/molmo-2-8b**                           | **1,607**    | ~89          | Works  |
| **google/gemini-2.5-flash-lite-preview-09-2025** | **4,651**    | ~258         | Works  |
| **qwen/qwen3.5-397b-a17b**                       | **5,604**    | ~311         | Works  |
| **z-ai/glm-4.6v**                                | **70,809**   | ~3,934       | Works  |

## Why GLM-4.6V Uses ~60x More Tokens Than Gemini 3 Flash

GLM-4.6V uses Qwen2-VL-style dynamic resolution with very permissive defaults:

- **Patch size 14×14** — each 14×14 pixel region becomes one ViT token
- **Max pixels default ~11.76M** — processes images at near-native resolution before downscaling
- **Merge factor 2×2** — tokens are merged post-ViT, but effective count is still `(H/14) × (W/14) / 4` per frame pair
- **No `detail` parameter** in the API (unlike OpenAI's `low`/`high` toggle)

For 3024×1964 frames: `(3024/14) × (1964/14) ≈ 30,240` raw tokens per frame, merged to ~7,560, times ~9 temporal frame pairs ≈ **~68k vision tokens**. Matches observed usage.

Community recommendation: pre-compress images to ~512×512 before sending to cut costs.

## Cost Implications (at OpenRouter pricing)

| Model                  | Input $/M | Cost for this video |
| ---------------------- | --------- | ------------------- |
| gemini-3-flash-preview | ~$0       | ~$0                 |
| molmo-2-8b             | $0.18     | $0.0003             |
| gemini-2.5-flash-lite  | $0.02     | $0.0001             |
| qwen3.5-397b-a17b      | $0.22     | $0.0012             |
| glm-4.6v               | $0.30     | $0.0213             |

GLM-4.6V costs ~200x more than Gemini 2.5 Flash Lite for the same video input.

## Reproducing

```python
import base64, json, urllib.request

with open("video.mp4", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

payload = json.dumps({
    "model": "MODEL_ID",
    "messages": [{"role": "user", "content": [
        {"type": "video_url", "video_url": {"url": f"data:video/mp4;base64,{b64}"}},
        {"type": "text", "text": "Describe this video in one sentence."}
    ]}],
    "max_tokens": 50,
})

req = urllib.request.Request(
    "https://openrouter.ai/api/v1/chat/completions",
    data=payload.encode(),
    headers={"Authorization": "Bearer YOUR_KEY", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req, timeout=120) as resp:
    data = json.loads(resp.read())
    print(data["usage"]["prompt_tokens"])
```
