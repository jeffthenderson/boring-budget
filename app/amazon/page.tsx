'use client'

import { useEffect, useMemo, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { formatCurrency } from '@/lib/utils/currency'

const STATUS_OPTIONS = ['all', 'matched', 'ambiguous', 'unmatched'] as const
const DEFAULT_APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_BASE_URL || 'https://boring-budget.vercel.app'

type MatchCandidate = {
  id: string
  date: string
  amount: number
  description: string
  subDescription?: string | null
  category: string
}

type AmazonOrderItem = {
  id: string
  title: string
  quantity: number
}

type AmazonOrder = {
  id: string
  amazonOrderId: string
  orderDate: string
  orderTotal: number
  currency: string
  orderUrl?: string | null
  itemCount: number
  matchStatus: 'matched' | 'ambiguous' | 'unmatched'
  matchMetadata?: { candidates?: MatchCandidate[] } | null
  category?: string | null
  categoryConfidence?: number | null
  items: AmazonOrderItem[]
  matchedTransaction?: {
    id: string
    date: string
    description: string
    subDescription?: string | null
    amount: number
    category: string
  } | null
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

function buildBookmarklet(baseUrl: string) {
  const safeBase = baseUrl.replace(/\/$/, '').replace(/'/g, "\\'")
  const script = `(async()=>{
  const appBase='${safeBase}';
  const normalizeText=(value)=>String(value||'').replace(/\\s+/g,' ').trim();
  const parseMoney=(value)=>{const cleaned=normalizeText(value).replace(/[^0-9.-]/g,'');const parsed=parseFloat(cleaned);return Number.isFinite(parsed)?parsed:null;};
  const detectCurrency=(value)=>{const text=normalizeText(value).toUpperCase();if(text.includes('US$')||text.includes('USD'))return 'USD';if(text.includes('CDN')||text.includes('CAD'))return 'CAD';if(text.includes('GBP'))return 'GBP';return 'CAD';};
  let statusEl=null;
  const ensureStatus=()=>{if(statusEl)return statusEl;const el=document.createElement('div');el.style.position='fixed';el.style.right='16px';el.style.bottom='16px';el.style.zIndex='999999';el.style.background='rgba(0,0,0,0.85)';el.style.color='#fff';el.style.padding='10px 12px';el.style.borderRadius='6px';el.style.fontSize='12px';el.style.fontFamily='system-ui, -apple-system, sans-serif';el.style.maxWidth='260px';el.style.boxShadow='0 2px 8px rgba(0,0,0,0.2)';el.textContent='Preparing Amazon import...';document.body.appendChild(el);statusEl=el;return el;};
  const setStatus=(text)=>{const el=ensureStatus();el.textContent=text;};
  const finalizeStatus=(text)=>{if(!statusEl)return;statusEl.textContent=text;setTimeout(()=>{statusEl.remove();},4000);};
  const ORDER_CARD_SELECTORS=['.order-card','.js-order-card','[data-test-id="order-card"]','[data-test-id="order-card-container"]','div[data-order-id]'];
  const ORDER_DATE_LABELS=['order placed','order date','ordered on'];
  const TOTAL_LABELS=['total','order total'];
  const getOrderCards=(doc)=>{const cards=new Set();ORDER_CARD_SELECTORS.forEach(selector=>{doc.querySelectorAll(selector).forEach(card=>cards.add(card));});return Array.from(cards);};
  const waitForOrderCards=async()=>{let cards=getOrderCards(document);let attempts=0;while(cards.length===0&&attempts<10){await new Promise(resolve=>setTimeout(resolve,500));cards=getOrderCards(document);attempts+=1;}return cards;};
  const getHeaderValueByLabels=(card,labels)=>{const labelSet=labels.map(label=>label.toLowerCase());const nodes=card.querySelectorAll('span, div, dt');for(const node of nodes){const text=normalizeText(node.textContent).toLowerCase();const normalized=text.replace(/:$/,'');if(!normalized||!labelSet.includes(normalized))continue;const container=node.closest('li, div, dt')||node.parentElement;if(container){const candidates=container.querySelectorAll('span, div, dd');for(const candidate of candidates){if(candidate===node)continue;const value=normalizeText(candidate.textContent);if(value&&!labelSet.includes(value.toLowerCase()))return value;}const sibling=container.nextElementSibling;if(sibling){const value=normalizeText(sibling.textContent);if(value)return value;}}}return '';};
  const getOrderId=(card)=>{const attr=card.getAttribute('data-order-id');if(attr)return normalizeText(attr);const idNode=card.querySelector('.yohtmlc-order-id span[dir="ltr"], .yohtmlc-order-id .a-color-secondary[dir="ltr"], [data-test-id="order-card-order-id"]');if(idNode)return normalizeText(idNode.textContent);const link=card.querySelector('a[href*="orderID="], a[href*="orderId="]');if(link){try{const url=new URL(link.getAttribute('href')||'',location.origin);const fromQuery=url.searchParams.get('orderID')||url.searchParams.get('orderId');if(fromQuery)return fromQuery;}catch{}}const text=normalizeText(card.textContent);const match=text.match(/order\\s*#\\s*([0-9-]+)/i);return match?match[1]:'';};
  const getOrderDateText=(card)=>{const direct=normalizeText(card.querySelector('[data-test-id="order-card-order-date"], [data-test-id="order-date"], [data-test-id="order-card-order-placed"]')?.textContent);if(direct)return direct;return getHeaderValueByLabels(card,ORDER_DATE_LABELS);};
  const getOrderTotalText=(card)=>{const direct=normalizeText(card.querySelector('[data-test-id="order-card-order-total"], [data-test-id="order-total"]')?.textContent);if(direct)return direct;return getHeaderValueByLabels(card,TOTAL_LABELS);};
  const parseOrder=(card)=>{const orderId=getOrderId(card);const orderDate=getOrderDateText(card);const totalText=getOrderTotalText(card);const orderTotal=parseMoney(totalText);const currency=detectCurrency(totalText);const itemNodes=[...card.querySelectorAll('.yohtmlc-product-title a, [data-test-id="order-card-product-title"], a[href*="/dp/"]')];const rawItems=[];for(const node of itemNodes){const title=normalizeText(node.textContent);if(!title)continue;const lower=title.toLowerCase();if(lower.includes('view your item')||lower.includes('buy it again'))continue;rawItems.push(title);}if(rawItems.length===0){rawItems.push(...[...card.querySelectorAll('.item-box img[alt]')].map(node=>normalizeText(node.getAttribute('alt'))).filter(Boolean));}const items=Array.from(new Set(rawItems));const orderLink=card.querySelector('a[href*="order-details"]');
  const orderUrl=orderLink?new URL(orderLink.getAttribute('href')||'',location.origin).toString():undefined;
  if(!orderId||!orderDate||orderTotal===null){return null;}
  return {orderId,orderDate,orderTotal,currency,orderUrl,items};};
  const getStartIndex=(url)=>{try{const parsed=new URL(url,location.origin);const start=Number.parseInt(parsed.searchParams.get('startIndex')||'0',10);return Number.isFinite(start)?start:0;}catch{return 0;}};
  const getNextUrl=(doc,current)=>{const paginationRoot=doc.querySelector('.a-pagination')||doc;const anchors=Array.from(paginationRoot.querySelectorAll('a'));const byLabel=anchors.find(anchor=>{const text=normalizeText(anchor.textContent).toLowerCase();const aria=normalizeText(anchor.getAttribute('aria-label')||'').toLowerCase();return text==='next'||text.startsWith('next')||aria.includes('next');});if(!byLabel)return null;const href=byLabel.getAttribute('href');if(!href)return null;const next=new URL(href,location.origin).toString();return next===current?null:next;};
  const collectPaginationValues=(doc)=>{const links=Array.from((doc.querySelector('.a-pagination')||doc).querySelectorAll('a'));const startIndices=new Set();const pages=new Set();for(const link of links){const href=link.getAttribute('href');if(!href)continue;try{const url=new URL(href,location.origin);const startParam=url.searchParams.get('startIndex');if(startParam!==null&&startParam!==''){const start=Number.parseInt(startParam,10);if(Number.isFinite(start))startIndices.add(start);}const pageParam=url.searchParams.get('page');if(pageParam!==null&&pageParam!==''){const page=Number.parseInt(pageParam,10);if(Number.isFinite(page))pages.add(page);}}catch{}}return {startIndices:[...startIndices],pages:[...pages]};};
  const getStepFromValues=(values,fallback)=>{const sorted=[...values].sort((a,b)=>a-b);let stepSize=Infinity;for(let i=1;i<sorted.length;i+=1){const diff=sorted[i]-sorted[i-1];if(diff>0&&diff<stepSize)stepSize=diff;}if(!Number.isFinite(stepSize)||stepSize<=0)stepSize=fallback;return stepSize;};
  const buildPageQueue=(doc,current,totalCount,step,startIndices,pages)=>{const base=new URL(current,location.origin);const currentStart=Number.parseInt(base.searchParams.get('startIndex')||'0',10)||0;const queue=new Set();const starts=Array.isArray(startIndices)&&startIndices.length?startIndices:[];const pageList=Array.isArray(pages)&&pages.length?pages:[];let stepSize=getStepFromValues(starts,step||10);if(!Number.isFinite(stepSize)||stepSize<=0)stepSize=10;let maxStart=null;if(totalCount&&stepSize){const totalPages=Math.max(1,Math.ceil(totalCount/stepSize));maxStart=(totalPages-1)*stepSize;}else if(starts.length){maxStart=Math.max(...starts);}if(maxStart!==null){for(let start=0;start<=maxStart;start+=stepSize){if(start===currentStart)continue;const url=new URL(base.toString());url.searchParams.set('startIndex',String(start));queue.add(url.toString());}for(const start of starts){if(start===currentStart)continue;const url=new URL(base.toString());url.searchParams.set('startIndex',String(start));queue.add(url.toString());}return Array.from(queue);}const currentPage=Number.parseInt(base.searchParams.get('page')||'1',10)||1;if(pageList.length){let pageStep=getStepFromValues(pageList,1);if(!Number.isFinite(pageStep)||pageStep<=0)pageStep=1;const maxPage=Math.max(...pageList);const minPage=Math.min(...pageList);for(let page=minPage;page<=maxPage;page+=pageStep){if(page===currentPage)continue;const url=new URL(base.toString());url.searchParams.set('page',String(page));queue.add(url.toString());}}return Array.from(queue);};
  const initialCards=await waitForOrderCards();
  if(!initialCards.length){alert('No orders found on this view. Try scrolling to load orders, then run again.');return;}
  const totalCountText=normalizeText(document.querySelector('.num-orders')?.textContent);
  const totalCountValue=Number.parseInt(totalCountText.replace(/[^0-9]/g,''),10);
  const totalCount=Number.isFinite(totalCountValue)?totalCountValue:null;
  const perPage=Math.max(initialCards.length,1);
  const {startIndices,pages}=collectPaginationValues(document);
  const fallbackStep=Math.max(perPage,10);
  const pageStep=getStepFromValues(startIndices,fallbackStep)||fallbackStep;
  const input=prompt('Enter your Boring Budget passcode (or paste an import token).');
  if(!input){return;}
  let token=input.trim();
  if(!token.includes('.')){
    const tokenRes=await fetch(appBase+'/api/amazon/token',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify({passcode:token})});
    if(!tokenRes.ok){alert('Could not get an import token. Check your passcode.');return;}
    const tokenData=await tokenRes.json();
    token=tokenData.token;
  }
  setStatus('Scanning orders...');
  let doc=document;let pageUrl=location.href;const seen=new Set();const orders=[];const pageQueue=buildPageQueue(document,pageUrl,totalCount,pageStep,startIndices,pages);const totalPages=totalCount?Math.max(1,Math.ceil(totalCount/pageStep)):pageQueue.length+1;const seenPages=new Set([pageUrl]);let pageCount=0;
  while(doc&&pageCount<50){pageCount+=1;const startIndex=getStartIndex(pageUrl);const currentPage=Math.floor(startIndex/pageStep)+1;setStatus('Scanning page '+currentPage+(totalPages?(' of '+totalPages):'')+'...');const cards=doc===document?initialCards:getOrderCards(doc);for(const card of cards){const order=parseOrder(card);if(!order||seen.has(order.orderId))continue;seen.add(order.orderId);orders.push(order);}let nextUrl=null;while(pageQueue.length){const candidate=pageQueue.shift();if(candidate&&!seenPages.has(candidate)){nextUrl=candidate;break;}}if(!nextUrl){const fallback=getNextUrl(doc,pageUrl);if(fallback&&!seenPages.has(fallback))nextUrl=fallback;}if(!nextUrl)break;seenPages.add(nextUrl);pageUrl=nextUrl;const res=await fetch(pageUrl,{credentials:'include',headers:{'accept':'text/html'}});const html=await res.text();doc=new DOMParser().parseFromString(html,'text/html');}
  if(orders.length===0){alert('No orders found on this view. Try scrolling to load orders, then run again.');return;}
  setStatus('Uploading '+orders.length+' orders...');
  const importRes=await fetch(appBase+'/api/amazon/import',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},credentials:'omit',body:JSON.stringify({orders,sourceUrl:location.href})});
  if(!importRes.ok){const errText=await importRes.text();alert('Import failed: '+errText);return;}
  const summary=await importRes.json();
  const doneMessage='Import complete. Created '+summary.created+', skipped '+summary.skipped+', matched '+summary.matched+', ambiguous '+summary.ambiguous+', unmatched '+summary.unmatched+'. Pages scanned: '+pageCount+'.';
  finalizeStatus(doneMessage);
  alert(doneMessage);
})();`

  return `javascript:${encodeURIComponent(script)}`
}

export default function AmazonPage() {
  const [appBaseUrl, setAppBaseUrl] = useState(DEFAULT_APP_BASE_URL)
  const [orders, setOrders] = useState<AmazonOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_OPTIONS)[number]>('all')
  const [tokenInfo, setTokenInfo] = useState<{ token: string; expiresAt: string } | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [tokenMessage, setTokenMessage] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)
  const [categorizing, setCategorizing] = useState(false)
  const [linkingIds, setLinkingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadOrders()
  }, [])

  const bookmarklet = useMemo(() => (appBaseUrl ? buildBookmarklet(appBaseUrl) : ''), [appBaseUrl])

  const counts = useMemo(() => {
    return orders.reduce(
      (acc, order) => {
        acc.total += 1
        acc[order.matchStatus] += 1
        return acc
      },
      { total: 0, matched: 0, ambiguous: 0, unmatched: 0 }
    )
  }, [orders])

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return orders
    return orders.filter(order => order.matchStatus === statusFilter)
  }, [orders, statusFilter])

  async function loadOrders() {
    setLoadingOrders(true)
    setError(null)
    try {
      const res = await fetch('/api/amazon/orders')
      if (!res.ok) {
        throw new Error('Failed to fetch orders.')
      }
      const data = await res.json()
      if (!Array.isArray(data)) {
        throw new Error('Unexpected orders response.')
      }
      setOrders(data)
    } catch (err) {
      console.error(err)
      setError('Failed to load Amazon orders.')
    } finally {
      setLoadingOrders(false)
    }
  }

  async function generateToken() {
    setTokenLoading(true)
    setTokenMessage(null)
    try {
      const res = await fetch('/api/amazon/token', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text)
      }
      const data = await res.json()
      setTokenInfo({ token: data.token, expiresAt: data.expiresAt })
      setTokenMessage('Token generated.')
    } catch (err: any) {
      console.error(err)
      setTokenMessage(err?.message || 'Failed to generate token.')
    } finally {
      setTokenLoading(false)
    }
  }

  async function copyText(value: string, onMessage?: (message: string) => void) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      onMessage?.('Copied to clipboard.')
    } catch {
      window.prompt('Copy to clipboard:', value)
    }
  }

  function handleBookmarkletDrag(event: DragEvent<HTMLDivElement>) {
    if (!bookmarklet) return
    event.dataTransfer.setData('text/uri-list', bookmarklet)
    event.dataTransfer.setData('text/plain', bookmarklet)
    event.dataTransfer.effectAllowed = 'copy'
  }

  async function runMatching() {
    setMatching(true)
    setStatusMessage(null)
    try {
      const res = await fetch('/api/amazon/match', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Matching failed.')
      }
      setStatusMessage(`Matching done. Matched ${data.matched}, ambiguous ${data.ambiguous}, unmatched ${data.unmatched}.`)
      await loadOrders()
    } catch (err) {
      console.error(err)
      setStatusMessage('Matching failed.')
    } finally {
      setMatching(false)
    }
  }

  async function runCategorize() {
    setCategorizing(true)
    setStatusMessage(null)
    try {
      const res = await fetch('/api/amazon/categorize', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setStatusMessage(`Categorized ${data.updated} orders. Skipped ${data.skipped}.`)
        await loadOrders()
      } else {
        throw new Error(data?.error || 'Failed to categorize.')
      }
    } catch (err: any) {
      console.error(err)
      setStatusMessage(err?.message || 'Categorization failed.')
    } finally {
      setCategorizing(false)
    }
  }

  async function linkOrder(orderId: string, transactionId: string | null) {
    setLinkingIds(prev => new Set(prev).add(orderId))
    setStatusMessage(null)
    try {
      const res = await fetch('/api/amazon/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, transactionId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to link order.')
      }
      setStatusMessage('Order updated.')
      await loadOrders()
    } catch (err: any) {
      console.error(err)
      setStatusMessage(err?.message || 'Failed to link order.')
    } finally {
      setLinkingIds(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  function getCandidates(order: AmazonOrder) {
    const metadata = order.matchMetadata
    if (!metadata || !Array.isArray(metadata.candidates)) return []
    return metadata.candidates
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link href="/" className="text-dark hover:underline text-sm">{'<- BACK TO BUDGET'}</Link>
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Amazon Orders
        </h1>
        <p className="text-sm text-monday-3pm">
          Match Amazon orders to existing transactions, then let the LLM categorize them.
        </p>
      </header>

      <div className="space-y-6">
        <Card title="Bookmarklet Setup">
          <div className="space-y-4">
            <Input
              label="Boring Budget Base URL"
              value={appBaseUrl}
              onChange={setAppBaseUrl}
              placeholder="https://boring-budget.vercel.app"
            />
            <div className="text-xs text-monday-3pm">
              This should point to wherever your budget app is running (local or Vercel).
            </div>
            <div className="text-xs text-monday-3pm">
              Amazon is HTTPS only, so use your Vercel URL if your local app is not served over HTTPS.
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-dark font-medium">Bookmarklet</div>
              <div className="flex flex-col gap-2">
                <textarea
                  readOnly
                  value={bookmarklet}
                  className="w-full min-h-[140px] border-2 border-cubicle-taupe bg-white px-3 py-2 text-xs text-dark font-mono"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => copyText(bookmarklet, setStatusMessage)} disabled={!bookmarklet}>
                    COPY BOOKMARKLET
                  </Button>
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={Boolean(bookmarklet)}
                    onDragStart={handleBookmarkletDrag}
                    className={`px-4 py-2 border-2 border-dark font-sans uppercase tracking-wide text-sm font-medium bg-white text-dark select-none ${
                      bookmarklet ? 'cursor-grab hover:bg-ceiling-grey' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    DRAG TO BOOKMARKS
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs text-monday-3pm">
              Open your Amazon orders page, set the filter you want (months-3, year-2025, etc.), then run the bookmarklet.
              It follows pagination for the current view and imports only order summaries + item titles.
            </div>
          </div>
        </Card>

        <Card title="Import Token (Optional)">
          <div className="space-y-3">
            <div className="text-xs text-monday-3pm">
              If you do not want to enter your passcode in the bookmarklet, generate a short-lived token instead.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={generateToken} disabled={tokenLoading}>
                {tokenLoading ? 'GENERATING...' : 'GENERATE TOKEN'}
              </Button>
              {tokenInfo?.token && (
                <Button variant="secondary" onClick={() => copyText(tokenInfo.token, setTokenMessage)}>
                  COPY TOKEN
                </Button>
              )}
            </div>
            {tokenInfo?.token && (
              <div className="space-y-1">
                <div className="text-xs uppercase tracking-wider text-dark font-medium">Token</div>
                <div className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-xs text-dark font-mono break-all">
                  {tokenInfo.token}
                </div>
                <div className="text-xs text-monday-3pm">Expires: {tokenInfo.expiresAt}</div>
              </div>
            )}
            {tokenMessage && <div className="text-xs text-monday-3pm">{tokenMessage}</div>}
          </div>
        </Card>

        <Card title="Orders Overview">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div>Total: {counts.total}</div>
            <div>Matched: {counts.matched}</div>
            <div>Ambiguous: {counts.ambiguous}</div>
            <div>Unmatched: {counts.unmatched}</div>
            <div className="flex items-center gap-2">
              <label className="text-xs uppercase tracking-wider text-dark font-medium">Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_OPTIONS)[number])}
                className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
              >
                {STATUS_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button variant="secondary" onClick={loadOrders} disabled={loadingOrders}>
                {loadingOrders ? 'REFRESHING...' : 'REFRESH'}
              </Button>
              <Button variant="secondary" onClick={runMatching} disabled={matching}>
                {matching ? 'MATCHING...' : 'RE-RUN MATCHING'}
              </Button>
              <Button onClick={runCategorize} disabled={categorizing}>
                {categorizing ? 'CATEGORIZING...' : 'CATEGORIZE WITH LLM'}
              </Button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-monday-3pm">{error}</div>}
          {statusMessage && <div className="mt-3 text-sm text-monday-3pm">{statusMessage}</div>}
        </Card>

        <Card title={`Orders (${filteredOrders.length})`}>
          {loadingOrders ? (
            <div className="text-sm text-monday-3pm">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-sm text-monday-3pm">No orders to show.</div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map(order => {
                const candidates = getCandidates(order)
                const isLinking = linkingIds.has(order.id)

                return (
                  <div key={order.id} className="border-b border-cubicle-taupe pb-4 last:border-b-0 last:pb-0">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-dark font-medium">
                          {formatDate(order.orderDate)}
                        </div>
                        <div className="text-lg text-dark">
                          {formatCurrency(order.orderTotal, order.currency || 'CAD')}
                        </div>
                        <div className="text-xs text-monday-3pm">Order #{order.amazonOrderId}</div>
                        {order.orderUrl && (
                          <a
                            href={order.orderUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-dark hover:underline"
                          >
                            View order on Amazon
                          </a>
                        )}
                      </div>
                      <div className="text-xs uppercase tracking-wider text-dark font-medium">
                        Status: {order.matchStatus}
                      </div>
                    </div>

                    {order.items.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs uppercase tracking-wider text-dark font-medium">Items</div>
                        <ul className="list-disc pl-5 text-sm text-dark">
                          {order.items.map(item => (
                            <li key={item.id}>{item.title}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {order.matchStatus === 'matched' && order.matchedTransaction && (
                      <div className="mt-3 border-t border-cubicle-taupe pt-3">
                        <div className="text-xs uppercase tracking-wider text-dark font-medium">Matched Transaction</div>
                        <div className="text-sm text-dark">
                          {formatDate(order.matchedTransaction.date)} · {formatCurrency(Math.abs(order.matchedTransaction.amount), order.currency || 'CAD')}
                        </div>
                        <div className="text-xs text-monday-3pm">
                          {order.matchedTransaction.description}
                          {order.matchedTransaction.subDescription ? ` · ${order.matchedTransaction.subDescription}` : ''}
                        </div>
                        <div className="text-xs text-monday-3pm">Category: {order.matchedTransaction.category}</div>
                        {order.category && (
                          <div className="text-xs text-monday-3pm">
                            LLM Category: {order.category}
                            {typeof order.categoryConfidence === 'number' && ` (${Math.round(order.categoryConfidence * 100)}%)`}
                          </div>
                        )}
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            onClick={() => linkOrder(order.id, null)}
                            disabled={isLinking}
                          >
                            {isLinking ? 'UPDATING...' : 'UNLINK'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {order.matchStatus === 'ambiguous' && (
                      <div className="mt-3 border-t border-cubicle-taupe pt-3 space-y-2">
                        <div className="text-xs uppercase tracking-wider text-dark font-medium">Possible Matches</div>
                        {candidates.length === 0 ? (
                          <div className="text-xs text-monday-3pm">No candidates stored.</div>
                        ) : (
                          candidates.map(candidate => (
                            <div key={candidate.id} className="flex flex-col gap-2 border-2 border-cubicle-taupe bg-white p-3">
                              <div className="text-sm text-dark">
                                {candidate.date} · {formatCurrency(candidate.amount, order.currency || 'CAD')}
                              </div>
                              <div className="text-xs text-monday-3pm">
                                {candidate.description}
                                {candidate.subDescription ? ` · ${candidate.subDescription}` : ''}
                              </div>
                              <div className="text-xs text-monday-3pm">Category: {candidate.category}</div>
                              <div>
                                <Button
                                  onClick={() => linkOrder(order.id, candidate.id)}
                                  disabled={isLinking}
                                >
                                  {isLinking ? 'LINKING...' : 'LINK THIS TRANSACTION'}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {order.matchStatus === 'unmatched' && (
                      <div className="mt-3 border-t border-cubicle-taupe pt-3">
                        <div className="text-xs text-monday-3pm">
                          No matching Amazon transactions found. Import the transaction CSV first, then re-run matching.
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
