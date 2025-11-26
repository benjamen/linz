import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

const app = express()
app.use(cors())
app.use(express.json())

// basic in-memory cache for API responses to reduce ArcGIS calls
const cache = new Map()
const CACHE_TTL_MS = 60 * 1000 // 60s

// simple rate limiter for /api endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // limit each IP to 120 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api/', apiLimiter)

const ADDRESS_API_URL = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Addresses_Pilot/FeatureServer/0/query'
const BOUNDARY_API_URL = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Property_Boundaries/FeatureServer/0/query'
const PROPERTY_API_URL = 'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Property_Titles/FeatureServer/0/query'

async function projectTo2193(x, y) {
  try {
    const geom = { geometryType: 'esriGeometryPoint', geometries: [{ x: Number(x), y: Number(y) }] }
    const params = new URLSearchParams({ f: 'json', inSR: '4326', outSR: '2193', geometries: JSON.stringify(geom) })
    const url = `https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project?${params}`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    if (json.geometries && json.geometries.length) return json.geometries[0]
    return null
  } catch (e) {
    return null
  }
}

async function queryBoundariesAtPoint(x, y, inSR = 2193) {
  const geometry = `${Number(x)},${Number(y)}`
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPoint',
    inSR: String(inSR),
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'legal_description,title_no,title_type,territorial_authority,valuation_reference,parcel_id,area,source',
    returnGeometry: 'false',
    f: 'json'
  })
  const url = `${BOUNDARY_API_URL}?${params}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error('Boundary query failed')
  return resp.json()
}

async function queryTitlesByTitleNo(title_no) {
  const params = new URLSearchParams({ where: `title_no='${title_no.replace(/'/g, "''")}'`, outFields: 'title_no,issue_date,status,type,estate_description,number_owners', f: 'json' })
  const url = `${PROPERTY_API_URL}?${params}`
  const resp = await fetch(url)
  if (!resp.ok) return null
  return resp.json()
}

async function findPropertyForAddressFeature(attrs) {
  // attrs contains gd2000_xcoord/gd2000_ycoord (lon/lat), or fallback we'll try geocode (not implemented here)
  let x = attrs.gd2000_xcoord
  let y = attrs.gd2000_ycoord
  if (x === undefined || y === undefined || x === null || y === null) return { property: null }

  // project to 2193
  const projected = await projectTo2193(x, y)
  let px = projected ? projected.x : null
  let py = projected ? projected.y : null
  const querySR = projected ? 2193 : 4326

  if (px === null) return { property: null }

  // try boundary point
  let bJson = await queryBoundariesAtPoint(px, py, querySR)
  if (bJson.features && bJson.features.length > 0) {
    const attr = bJson.features[0].attributes
    const property = {
      legal_description: attr.legal_description,
      title_no: attr.title_no,
      parcel_id: attr.parcel_id,
      area: attr.area,
      source: attr.source
    }

    // enrich with titles layer
    if (property.title_no) {
      try {
        const tJson = await queryTitlesByTitleNo(property.title_no)
        if (tJson && tJson.features && tJson.features.length > 0) {
          Object.assign(property, tJson.features[0].attributes)
        }
      } catch (e) {
        // ignore
      }
    }

    return { property, projected_x: px, projected_y: py }
  }

  // Retry small buffer
  const bufferParams = new URLSearchParams({
    geometry: `${px},${py}`,
    geometryType: 'esriGeometryPoint',
    inSR: String(querySR),
    spatialRel: 'esriSpatialRelIntersects',
    distance: '10',
    units: 'esriSRUnit_Meter',
    outFields: 'legal_description,title_no,title_type,territorial_authority,valuation_reference,parcel_id,area,source',
    returnGeometry: 'false',
    f: 'json'
  })
  const retryUrl = `${BOUNDARY_API_URL}?${bufferParams}`
  const retryResp = await fetch(retryUrl)
  if (retryResp.ok) {
    const retryJson = await retryResp.json()
    if (retryJson.features && retryJson.features.length > 0) {
      const attr = retryJson.features[0].attributes
      const property = { legal_description: attr.legal_description, title_no: attr.title_no, parcel_id: attr.parcel_id, area: attr.area, source: attr.source }
      if (property.title_no) {
        try {
          const tJson = await queryTitlesByTitleNo(property.title_no)
          if (tJson && tJson.features && tJson.features.length > 0) Object.assign(property, tJson.features[0].attributes)
        } catch (e) {}
      }
      return { property, projected_x: px, projected_y: py }
    }
  }

  // envelope retries
  const radii = [1,5,10,50,100]
  for (const r of radii) {
    const xmin = px - r
    const ymin = py - r
    const xmax = px + r
    const ymax = py + r
    const env = `${xmin},${ymin},${xmax},${ymax}`
    const envParams = new URLSearchParams({ geometry: env, geometryType: 'esriGeometryEnvelope', inSR: String(querySR), spatialRel: 'esriSpatialRelIntersects', outFields: 'legal_description,title_no,title_type,territorial_authority,valuation_reference,parcel_id,area,source', returnGeometry: 'false', f: 'json' })
    try {
      const envResp = await fetch(`${BOUNDARY_API_URL}?${envParams}`)
      if (!envResp.ok) continue
      const envJson = await envResp.json()
      if (envJson.features && envJson.features.length > 0) {
        const attr = envJson.features[0].attributes
        const property = { legal_description: attr.legal_description, title_no: attr.title_no, parcel_id: attr.parcel_id, area: attr.area, source: attr.source }
        if (property.title_no) {
          try {
            const tJson = await queryTitlesByTitleNo(property.title_no)
            if (tJson && tJson.features && tJson.features.length > 0) Object.assign(property, tJson.features[0].attributes)
          } catch (e) {}
        }
        return { property, projected_x: px, projected_y: py }
      }
    } catch (e) {
      continue
    }
  }

  return { property: null, projected_x: px, projected_y: py }
}

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'missing q query param' })

  // check cache
  try {
    const cacheKey = `search:${q}`
    const entry = cache.get(cacheKey)
    if (entry && entry.expires > Date.now()) {
      return res.json(entry.data)
    }
  } catch (e) {
    // ignore cache errors
  }

  try {
    const where = `full_address LIKE '${q.replace(/'/g, "''")}%'
    `
    const params = new URLSearchParams({ where, outFields: 'full_address,address_id,gd2000_xcoord,gd2000_ycoord', returnGeometry: 'false', resultRecordCount: '10', f: 'json' })
    const url = `${ADDRESS_API_URL}?${params}`
    const addrResp = await fetch(url)
    if (!addrResp.ok) return res.status(502).json({ error: 'address service error' })
    const addrJson = await addrResp.json()

    const results = []
    if (addrJson.features && addrJson.features.length > 0) {
      for (const feat of addrJson.features) {
        const attrs = feat.attributes
        const lookup = await findPropertyForAddressFeature(attrs)
        results.push({ address: attrs.full_address, address_id: attrs.address_id, coords: { gd2000_x: attrs.gd2000_xcoord, gd2000_y: attrs.gd2000_ycoord }, projected_x: lookup.projected_x || null, projected_y: lookup.projected_y || null, property: lookup.property })
      }
    }

    const out = { query: q, count: results.length, results }

    try {
      const cacheKey = `search:${q}`
      cache.set(cacheKey, { data: out, expires: Date.now() + CACHE_TTL_MS })
    } catch (e) {}

    res.json(out)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// health check for hosting platforms
app.get('/health', (req, res) => res.json({ status: 'ok' }))

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`API server listening on http://localhost:${port}`))
