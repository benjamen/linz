<template>
  <div class="address-form">
    <div class="form-group">
      <label for="search-input">Search Address</label>
      <input
        id="search-input"
        v-model="searchQuery"
        type="text"
        placeholder="Enter address (e.g., 120 Queen Street)"
        @input="debounceSearch"
        class="search-input"
      />
    </div>

    <div v-if="loading" class="loading">
      Loading addresses...
    </div>

    <div v-if="error" class="error">
      {{ error }}
    </div>

    <div v-if="addresses.length > 0" class="results">
      <h3>Select an Address:</h3>
      <div class="address-list">
        <button
          v-for="address in addresses"
          :key="address.address_id"
          class="address-item"
          :class="{ selected: selectedAddress?.address_id === address.address_id }"
          @click="selectAddress(address)"
        >
          <div class="address-text">{{ address.full_address }}</div>
          <div class="address-id">ID: {{ address.address_id }}</div>
        </button>
      </div>
    </div>

    <div v-if="searchQuery && !loading && addresses.length === 0" class="no-results">
      No addresses found
    </div>

    <!-- ==========================
         SELECTED ADDRESS SECTION
         ========================== -->
    <div v-if="selectedAddress" class="selected-section">
      <h3>Selected Address</h3>

      <div class="selected-address">
        <p><strong>Address:</strong> {{ selectedAddress.full_address }}</p>
        <p><strong>Address ID:</strong> {{ selectedAddress.address_id }}</p>

        <p v-if="selectedAddress.gd2000_xcoord !== null">
          <strong>GD2000 X:</strong> {{ selectedAddress.gd2000_xcoord }}
          &nbsp;&nbsp;
          <strong>GD2000 Y:</strong> {{ selectedAddress.gd2000_ycoord }}
        </p>

        <p v-if="selectedAddress.projected_x !== null">
          <strong>Projected X (2193):</strong> {{ selectedAddress.projected_x }}
          &nbsp;&nbsp;
          <strong>Projected Y (2193):</strong> {{ selectedAddress.projected_y }}
        </p>
      </div>

      <!-- PROPERTY DETAILS -->
      <div v-if="propertyDetails" class="property-section">
        <h3>Property Title Details</h3>
        <div class="property-details">
          <div
            v-for="(value, key) in propertyDetails"
            :key="key"
            class="property-item"
          >
            <span class="property-key">{{ formatKey(key) }}:</span>
            <span class="property-value">{{ value }}</span>
          </div>
        </div>
      </div>

      <!-- DISTRICT PLAN DATA -->
      <div v-if="districtPlan && districtPlan.length" class="district-plan-section">
        <h3>District Plan Overlays</h3>

        <div
          v-for="(dp, index) in districtPlan"
          :key="index"
          class="dp-item"
        >
          <h4 class="dp-title">Overlay {{ index + 1 }}</h4>

          <pre class="dp-json">
{{ JSON.stringify(dp.attributes, null, 2) }}
          </pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const searchQuery = ref('')
const addresses = ref([])
const selectedAddress = ref(null)
const loading = ref(false)
const error = ref('')
const propertyDetails = ref(null)
const districtPlan = ref(null)
let debounceTimer = null

const API_BASE = 'https://linz.onrender.com'
const SEARCH_API = `${API_BASE}/api/search`

const searchAddresses = async () => {
  if (!searchQuery.value || searchQuery.value.length < 2) {
    addresses.value = []
    return
  }

  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams({ q: searchQuery.value })
    const resp = await fetch(`${SEARCH_API}?${params}`)
    if (!resp.ok) throw new Error('Search API error')

    const data = await resp.json()

    addresses.value = data.results.map(r => ({
      full_address: r.address,
      address_id: r.address_id,
      gd2000_xcoord: r.coords?.gd2000_x ?? null,
      gd2000_ycoord: r.coords?.gd2000_y ?? null,
      projected_x: r.projected_x ?? null,
      projected_y: r.projected_y ?? null,
      property: r.property ?? null,
      district_plan: r.district_plan ?? []
    }))
  } catch (err) {
    error.value = err.message
    addresses.value = []
  } finally {
    loading.value = false
  }
}

const debounceSearch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(searchAddresses, 300)
}

const selectAddress = (address) => {
  selectedAddress.value = address
  propertyDetails.value = address.property || null
  districtPlan.value = address.district_plan || []
}

const formatKey = (key) =>
  key
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
</script>

<style scoped>
/* (same styles as before, unchanged) */
.dp-json {
  background: #f7f7f7;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #ccc;
  white-space: pre-wrap;
  font-size: 13px;
}
.dp-item {
  margin-bottom: 20px;
}
.dp-title {
  margin: 0 0 8px 0;
  color: #333;
  font-weight: bold;
}
</style>
