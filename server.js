import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

const app = express()
app.use(cors())
app.use(express.json())

// basic in-memory cache for API responses to reduce ArcGIS calls
const cache = new Map()
const CACHE_TTL_MS = 60 * 1000 // 60s

// simple rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api/', apiLimiter)

const ADDRESS_API_URL =
  'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Addresses_Pilot/FeatureServer/0/query'
const BOUNDARY_API_URL =
  'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Property_Boundaries/FeatureServer/0/query'
const PROPERTY_API_URL =
  'https://services.arcgis.com/xdsHIIxuCWByZiCB/ArcGIS/rest/services/LINZ_NZ_Property_Titles/FeatureServer/0/query'

// District Plan Layer 26
const DISTRICT_PLAN_URL =
  'https://services1.arcgis.com/DlsnLEhGfXazS5Er/ArcGIS/rest/services/Lower_Hutt_District_Plan_Data/FeatureServer/26/query'

// ------------------------------------------------------
// 🔥 COMPLETE LAYER CONFIG (Zoning, Hazard, Coastal, etc.)
// ------------------------------------------------------
const LAYER_CONFIG = {
  districtPlan: {
    name: 'District Plan',
    url: DISTRICT_PLAN_URL,
    outFields: '*'
  },

  floodHazard: {
    name: 'Flood Hazard Overlay',
    url: 'https://tiles.arcgis.com/tiles/DlsnLEhGfXazS5Er/arcgis/rest/services/Flood_Hazard_Overlay/MapServer',
    sublayers: [
      42, 43, 44, 45, 60, 61, 62, 63, 64, 65
    ],
    outFields: '*'
  },

  coastalHazard: {
    name: 'Coastal Hazard Overlay',
    url: 'https://open-data-huttcity.hub.arcgis.com/arcgis/rest/services/Coastal_Hazard_Overlay_-_Inundation/MapServer',
    sublayers: [0],
    outFields: '*'
  },

  slopeHazard: {
    name: 'Slope & Natural Hazards (Proposed)',
    url: null,   // No public map/feature service published yet
    sublayers: null,
    outFields: '*'
  }
}

// ------------------------------------------------------
// Projection
// ------------------------------------------------------
async function projectTo2193(x, y) {
  try {
    const geom = {
      geometryType: 'esriGeometryPoint',
      geometries: [{ x: Number(x), y: Number(y) }]
    }
    const params = new URLSearchParams({
      f: 'json',
      inSR: '4326',
      outSR: '2193',
      geometries: JSON.stringify(geom)
    })
    const url = `https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer/project?${params}`
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return json?.geometries?.[0] || null
  } catch {
    return null
  }
}

// ------------------------------------------------------
// Queries
// ------------------------------------------------------
async function queryBoundariesAtPoint(x, y, inSR = 2193) {
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: 'esriGeometryPoint',
    inSR: String(inSR),
    spatialRel: 'esriSpatialRelIntersects',
    outFields:
      'legal_description,title_no,title_type,territorial_authority,valuation_reference,parcel_id,area,source',
    returnGeometry: 'false',
    f: 'json'
  })
  const resp = await fetch(`${BOUNDARY_API_URL}?${params}`)
  if (!resp.ok) throw new Error('Boundary query failed')
  return resp.json()
}

async function queryTitlesByTitleNo(title_no) {
  const params = new URLSearchParams({
    where: `title_no='${title_no.replace(/'/g, "''")}'`,
    outFields: 'title_no,issue_date,status,type,estate_description,number_owners',
    f: 'json'
  })
  const resp = await fetch(`${PROPERTY_API_URL}?${params}`)
  if (!resp.ok) return null
  return resp.json()
}

// ------------------------------------------------------
// Hazard / Overlay Point Query Engine
// ------------------------------------------------------
async function queryGenericPoint(layerUrl, layerId, x, y, inSR = 2193, outFields = '*') {
  const params = new URLSearchParams({
    geometry: `${x},${y}`,
    geometryType: 'esriGeometryPoint',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: String(inSR),
    outFields,
    returnGeometry: 'false',
    f: 'json'
  })

  const url =
    layerId === null
      ? `${layerUrl}?${params}`
      : `${layerUrl}/${layerId}/query?${params}`

  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const json = await resp.json()
    return json?.features ?? null
  } catch {
    return null
  }
}

async function queryAllHazards(px, py, sr = 2193) {
  const out = {}

  for (const key of Object.keys(LAYER_CONFIG)) {
    const cfg = LAYER_CONFIG[key]

    if (!cfg.url) {
      out[key] = null
      continue
    }

    if (cfg.sublayers) {
      // MapServer with sublayers
      const results = await Promise.all(
        cfg.sublayers.map((id) =>
          queryGenericPoint(cfg.url, id, px, py, sr, cfg.outFields)
        )
      )
      out[key] = results.flat().filter(Boolean)
    } else {
      // FeatureServer or single-layer MapServer
      out[key] = await queryGenericPoint(cfg.url, null, px, py, sr, cfg.outFields)
    }
  }

  return out
}

// ------------------------------------------------------
// Main Resolver
// ------------------------------------------------------
async function findPropertyForAddressFeature(attrs) {
  let x = attrs.gd2000_xcoord
  let y = attrs.gd2000_ycoord
  if (x == null || y == null) return { property: null, hazards: null }

  const projected = await projectTo2193(x, y)
  const px = projected?.x ?? null
  const py = projected?.y ?? null
  const sr = projected ? 2193 : 4326
  if (!px) return { property: null, hazards: null }

  // property boundary lookup
  let bJson = await queryBoundariesAtPoint(px, py, sr)
  let property = null

  if (bJson.features?.length) {
    const a = bJson.features[0].attributes
    property = {
      legal_description: a.legal_description,
      title_no: a.title_no,
      parcel_id: a.parcel_id,
      area: a.area,
      source: a.source
    }

    if (property.title_no) {
      const tJson = await queryTitlesByTitleNo(property.title_no)
      if (tJson?.features?.length) {
        Object.assign(property, tJson.features[0].attributes)
      }
    }
  }

  // ALL district plan + hazard overlays
  const hazards = await queryAllHazards(px, py, sr)

  return {
    property,
    hazards,
    projected_x: px,
    projected_y: py
  }
}

// ------------------------------------------------------
// API
// ------------------------------------------------------
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.status(400).json({ error: 'missing q query param' })

  const cacheKey = `search:${q}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expires > Date.now()) return res.json(hit.data)

  try {
    const where = `full_address LIKE '${q.replace(/'/g, "''")}%'`
    const params = new URLSearchParams({
      where,
      outFields: 'full_address,address_id,gd2000_xcoord,gd2000_ycoord',
      returnGeometry: 'false',
      resultRecordCount: '10',
      f: 'json'
    })

    const addrResp = await fetch(`${ADDRESS_API_URL}?${params}`)
    if (!addrResp.ok)
      return res.status(502).json({ error: 'address service error' })

    const addrJson = await addrResp.json()

    const results = []
    for (const feat of addrJson.features || []) {
      const attrs = feat.attributes
      const lookup = await findPropertyForAddressFeature(attrs)

      results.push({
        address: attrs.full_address,
        address_id: attrs.address_id,
        coords: {
          gd2000_x: attrs.gd2000_xcoord,
          gd2000_y: attrs.gd2000_ycoord
        },
        projected_x: lookup.projected_x,
        projected_y: lookup.projected_y,
        property: lookup.property,

        // consolidated hazards (zoning, flood, coastal, etc.)
        hazards: lookup.hazards
      })
    }

    const out = { query: q, count: results.length, results }
    cache.set(cacheKey, { data: out, expires: Date.now() + CACHE_TTL_MS })
    res.json(out)
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

const port = process.env.PORT || 3000
app.listen(port, () =>
  console.log(`API server listening on http://localhost:${port}`)
)
