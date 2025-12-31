import { categorizeTransactionsWithLLM } from '@/lib/actions/llm-categorize'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const periodId = body?.periodId
  const scope = body?.scope

  if (!periodId || typeof periodId !== 'string') {
    return new Response(JSON.stringify({ error: 'periodId is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const onProgress = (update: Record<string, unknown>) => {
        send(update)
      }

      categorizeTransactionsWithLLM(periodId, { scope }, onProgress)
        .then(result => {
          send({ type: 'done', ...result })
          controller.close()
        })
        .catch(error => {
          send({ type: 'error', message: error?.message || 'Failed to categorize.' })
          controller.close()
        })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
