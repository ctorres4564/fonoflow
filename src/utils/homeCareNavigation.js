const cleanAddress = (address) => [address.street, address.number, address.complement, address.district, address.city, address.state, address.postalCode].filter(Boolean).join(', ')

export const getHomeCareNavigationUrls = (addressSnapshot) => {
  const query = encodeURIComponent(cleanAddress(addressSnapshot))
  return query ? {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${query}`,
    waze: `https://www.waze.com/ul?q=${query}&navigate=yes`,
  } : null
}
