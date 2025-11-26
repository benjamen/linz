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

    <div v-if="selectedAddress" class="selected-section">
      <h3>Selected Address:</h3>
        <div class="selected-address">
          <p><strong>Address:</strong> {{ selectedAddress.full_address }}</p>
          <p><strong>Address ID:</strong> {{ selectedAddress.address_id }}</p>
          <p v-if="selectedAddress.gd2000_xcoord !== undefined && selectedAddress.gd2000_ycoord !== undefined">
            <strong>GD2000 X:</strong> {{ selectedAddress.gd2000_xcoord }}
            &nbsp;&nbsp;
            <strong>GD2000 Y:</strong> {{ selectedAddress.gd2000_ycoord }}
          </p>
          <p v-if="selectedAddress.projected_x !== undefined && selectedAddress.projected_y !== undefined">
            <strong>Projected X (2193):</strong> {{ selectedAddress.projected_x }}
            &nbsp;&nbsp;
            <strong>Projected Y (2193):</strong> {{ selectedAddress.projected_y }}
          </p>
        </div>

      <div v-if="loadingPropertyDetails" class="loading">
        Loading property details...
      </div>

      <div v-if="propertyError" class="error">
        {{ propertyError }}
      </div>

      <div v-if="propertyDetails" class="property-section">
        <h3>Property Title Details:</h3>
        <div class="property-details">
          <div v-for="(value, key) in propertyDetails" :key="key" class="property-item">
            <span class="property-key">{{ formatKey(key) }}:</span>
            <span class="property-value">{{ value }}</span>
          </div>
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
const loadingPropertyDetails = ref(false)
const propertyError = ref('')
const propertyDetails = ref(null)
let debounceTimer = null

// Use the hosted API (Render) so frontend doesn't call ArcGIS directly
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
      const resp = await fetch(`${SEARCH_API}?${params}`, { headers: { Accept: 'application/json' } })
      if (!resp.ok) throw new Error('Search API error')
      const data = await resp.json()
      if (data.results && data.results.length > 0) {
        // map server results to the shape expected by this component
        addresses.value = data.results.map(r => ({
          full_address: r.address,
          address_id: r.address_id,
          gd2000_xcoord: r.coords?.gd2000_x ?? null,
          gd2000_ycoord: r.coords?.gd2000_y ?? null,
          projected_x: r.projected_x ?? null,
          projected_y: r.projected_y ?? null,
          property: r.property ?? null
        }))
      } else {
        addresses.value = []
      }
    } catch (err) {
      error.value = `Error: ${err.message}`
      addresses.value = []
    } finally {
      loading.value = false
    }
}

const fetchPropertyDetails = async (address) => {
  // With the server returning property details on search, simply set propertyDetails
  loadingPropertyDetails.value = false
  propertyError.value = ''
  propertyDetails.value = address.property || null
}

const debounceSearch = () => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    searchAddresses()
  }, 300)
}

const selectAddress = async (address) => {
  selectedAddress.value = address
  // property is included in the search API response
  propertyDetails.value = address.property || null
}

const formatKey = (key) => {
  // Convert snake_case to Title Case
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
</script>

<style scoped>
.address-form {
  max-width: 600px;
  margin: 20px auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #333;
}

.search-input {
  width: 100%;
  padding: 12px;
  font-size: 14px;
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.search-input:focus {
  outline: none;
  border-color: #4a90e2;
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
}

.loading {
  padding: 16px;
  text-align: center;
  color: #666;
  font-style: italic;
}

.error {
  padding: 12px;
  margin: 10px 0;
  background-color: #fee;
  color: #c33;
  border-left: 4px solid #c33;
  border-radius: 2px;
}

.results {
  margin: 20px 0;
}

.results h3 {
  margin-bottom: 12px;
  color: #333;
}

.address-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.address-item {
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 4px;
  background-color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.address-item:hover {
  border-color: #4a90e2;
  background-color: #f8fbff;
}

.address-item.selected {
  border-color: #4a90e2;
  background-color: #e8f1ff;
  font-weight: 600;
}

.address-text {
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.address-id {
  font-size: 12px;
  color: #999;
}

.no-results {
  padding: 16px;
  text-align: center;
  color: #999;
  font-style: italic;
}

.selected-section {
  margin-top: 30px;
  padding: 16px;
  background-color: #f0f8ff;
  border-left: 4px solid #4a90e2;
  border-radius: 4px;
}

.selected-section h3 {
  margin-top: 0;
  color: #333;
}

.selected-address {
  margin: 12px 0 20px 0;
  padding-bottom: 20px;
  border-bottom: 2px solid #d0e8ff;
}

.selected-address p {
  margin: 8px 0;
  color: #333;
}

.selected-address strong {
  color: #4a90e2;
}

.property-section {
  margin-top: 20px;
  padding: 16px;
  background-color: #fff;
  border-radius: 4px;
  border: 1px solid #d0e8ff;
}

.property-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #333;
  font-size: 1.1rem;
}

.property-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.property-item {
  padding: 12px;
  background-color: #f9f9f9;
  border-radius: 4px;
  border-left: 3px solid #4a90e2;
  display: flex;
  flex-direction: column;
}

.property-key {
  font-weight: 600;
  color: #4a90e2;
  font-size: 0.9rem;
  margin-bottom: 4px;
}

.property-value {
  color: #333;
  word-break: break-word;
  font-size: 0.95rem;
}

</style>
