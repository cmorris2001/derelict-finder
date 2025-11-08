// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

type GenerateRequest = {
  prompt: string
  imageUrl?: string
  strength?: number
  mode?: 'preserve' | 'newbuild' // <— new
}

const REPLICATE_API_TOKEN = Deno.env.get("REPLICATE_API_TOKEN")

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") || "*"
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  }
}

// Look up the latest version id for a model (so we don’t hardcode stale versions)
async function getLatestVersionId(model: string): Promise<string> {
  const res = await fetch(`https://api.replicate.com/v1/models/${model}/versions`, {
    headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`versions list failed: ${res.status} ${text}`)
  const data = JSON.parse(text)
  const id = data?.results?.[0]?.id
  if (!id) throw new Error(`no versions available for ${model}`)
  return id
}

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = corsHeadersFor(req)

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: CORS })

  if (!REPLICATE_API_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing REPLICATE_API_TOKEN secret" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  let body: GenerateRequest
  try { body = (await req.json()) as GenerateRequest } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  const mode = body.mode || (body.imageUrl ? 'preserve' : 'newbuild')
  const prompt = body.prompt?.trim()
  const imageUrl = body.imageUrl?.trim()
  const strength = Math.max(0.1, Math.min(0.95, Number(body.strength ?? 0.4)))

  if (!prompt) {
    return new Response(JSON.stringify({ error: "Missing prompt" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  // Choose model names
  const TEXT2IMG_MODEL = "stability-ai/sdxl"
  const IMG2IMG_MODEL  = "stability-ai/stable-diffusion-img2img"

  const usingImg2Img = mode === 'preserve' && !!imageUrl
  const model = usingImg2Img ? IMG2IMG_MODEL : TEXT2IMG_MODEL

  try {
    const version = await getLatestVersionId(model)

    const input = usingImg2Img
      ? {
          image: imageUrl,
          prompt: `${prompt}, architectural visualization, photorealistic, high quality, detailed`,
          negative_prompt: "blurry, low quality, distorted, text, watermark",
          strength,
          num_outputs: 1,
          guidance_scale: 7.5,
          num_inference_steps: 28,
        }
      : {
          prompt: `${prompt}, architectural visualization, photorealistic, high quality, detailed`,
          negative_prompt: "blurry, low quality, distorted, text, watermark",
          num_outputs: 1,
          width: 896,    // a bit smaller for speed/cost while testing
          height: 640,
          guidance_scale: 6.5,
          num_inference_steps: 24,
        }

    // Start prediction
    const start = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${REPLICATE_API_TOKEN}`,
      },
      body: JSON.stringify({ version, input }),
    })

    const startText = await start.text()
    if (!start.ok) {
      // pass through exact error (billing, permission, image fetch, etc.)
      return new Response(JSON.stringify({ where: "start", status: start.status, body: startText }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    const created = JSON.parse(startText)
    let status = created.status
    let result = created

    // Poll until done
    while (status !== "succeeded" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1100))
      const poll = await fetch(`https://api.replicate.com/v1/predictions/${created.id}`, {
        headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
      })
      const pollText = await poll.text()
      if (!poll.ok) {
        return new Response(JSON.stringify({ where: "poll", status: poll.status, body: pollText }), {
          status: 502, headers: { ...CORS, "Content-Type": "application/json" },
        })
      }
      result = JSON.parse(pollText)
      status = result.status
    }

    if (status === "failed") {
      return new Response(JSON.stringify({ error: "AI generation failed", result }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    const out = Array.isArray(result.output) ? result.output[0] : result.output
    return new Response(JSON.stringify({ imageUrl: out }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: "Server error", detail: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }
})

