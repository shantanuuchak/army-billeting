"use client"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  MapPin,
  Shield,
  Users,
  Truck,
  Loader2,
  Navigation,
  Clock,
  Route,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react"

interface Location {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  type: "hotel" | "school"
  rating?: number
}

interface RouteData {
  distance: string
  duration: string
  steps: Array<{
    instruction: string
    distance: string
    duration: string
  }>
}

type AppState = "login" | "location-request" | "category" | "map" | "navigation"

export default function RaturiApp() {
  const [appState, setAppState] = useState<AppState>("login")
  const [armyNumber, setArmyNumber] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<"hotels" | "mt" | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationError, setLocationError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [routeData, setRouteData] = useState<RouteData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [mapError, setMapError] = useState("")
  const [routeError, setRouteError] = useState("")
  const [isOnline, setIsOnline] = useState(true)
  const [retryCount, setRetryCount] = useState(0)

  const mapCanvasRef = useRef<HTMLCanvasElement>(null)
  const navCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  const geocodeLocation = async (query: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      )
      const data = await response.json()

      if (data && data.length > 0) {
        return {
          lat: Number.parseFloat(data[0].lat),
          lng: Number.parseFloat(data[0].lon),
        }
      }
      return null
    } catch (error) {
      console.error("Geocoding error:", error)
      return null
    }
  }

  const fetchNearbyPlaces = async (lat: number, lng: number, type: "hotel" | "school"): Promise<Location[]> => {
    try {
      const radius = 5000 // 5km radius
      const overpassQuery =
        type === "hotel"
          ? `[out:json][timeout:25];(node["tourism"="hotel"](around:${radius},${lat},${lng});way["tourism"="hotel"](around:${radius},${lat},${lng});relation["tourism"="hotel"](around:${radius},${lat},${lng}););out center meta;`
          : `[out:json][timeout:25];(node["amenity"="school"](around:${radius},${lat},${lng});way["amenity"="school"](around:${radius},${lat},${lng});relation["amenity"="school"](around:${radius},${lat},${lng}););out center meta;`

      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: overpassQuery,
      })

      const data = await response.json()

      return data.elements.slice(0, 10).map((element: any, index: number) => ({
        id: element.id?.toString() || `${type}-${index}`,
        name: element.tags?.name || `${type === "hotel" ? "Hotel" : "School"} ${index + 1}`,
        lat: element.lat || element.center?.lat || lat,
        lng: element.lon || element.center?.lon || lng,
        address: element.tags?.["addr:full"] || element.tags?.["addr:street"] || "Address not available",
        type: type,
        rating: element.tags?.stars ? Number.parseFloat(element.tags.stars) : undefined,
      }))
    } catch (error) {
      console.error("Error fetching places:", error)
      // Return fallback data if API fails
      return generateFallbackLocations(lat, lng, type)
    }
  }

  const generateFallbackLocations = (lat: number, lng: number, type: "hotel" | "school"): Location[] => {
    const baseNames =
      type === "hotel"
        ? ["Grand Hotel", "Royal Inn", "City Lodge", "Palace Hotel", "Crown Plaza"]
        : ["Delhi Public School", "Kendriya Vidyalaya", "Army School", "St. Mary's School", "Modern School"]

    return baseNames.map((name, index) => ({
      id: `fallback-${type}-${index}`,
      name,
      lat: lat + (Math.random() - 0.5) * 0.02,
      lng: lng + (Math.random() - 0.5) * 0.02,
      address: `${name} Address, Delhi`,
      type,
      rating: 3 + Math.random() * 2,
    }))
  }

  const calculateRoute = async (
    start: { lat: number; lng: number },
    end: { lat: number; lng: number },
  ): Promise<RouteData> => {
    try {
      // Try OSRM API for routing
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&steps=true`,
      )

      if (response.ok) {
        const data = await response.json()
        const route = data.routes[0]

        return {
          distance: `${(route.distance / 1000).toFixed(1)} km`,
          duration: `${Math.round(route.duration / 60)} min`,
          steps: route.legs[0].steps.slice(0, 8).map((step: any) => ({
            instruction: step.maneuver.instruction || "Continue straight",
            distance: `${(step.distance / 1000).toFixed(1)} km`,
            duration: `${Math.round(step.duration / 60)} min`,
          })),
        }
      }
    } catch (error) {
      console.error("Routing error:", error)
    }

    // Fallback calculation
    const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng)
    const duration = Math.round(distance * 2) // Rough estimate: 2 min per km

    return {
      distance: `${distance.toFixed(1)} km`,
      duration: `${duration} min`,
      steps: [
        {
          instruction: "Head towards destination",
          distance: `${(distance * 0.3).toFixed(1)} km`,
          duration: `${Math.round(duration * 0.3)} min`,
        },
        {
          instruction: "Continue on main road",
          distance: `${(distance * 0.4).toFixed(1)} km`,
          duration: `${Math.round(duration * 0.4)} min`,
        },
        {
          instruction: "Turn towards destination",
          distance: `${(distance * 0.2).toFixed(1)} km`,
          duration: `${Math.round(duration * 0.2)} min`,
        },
        {
          instruction: "Arrive at destination",
          distance: `${(distance * 0.1).toFixed(1)} km`,
          duration: `${Math.round(duration * 0.1)} min`,
        },
      ],
    }
  }

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371 // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const drawMap = (
    canvas: HTMLCanvasElement,
    center: { lat: number; lng: number },
    locations: Location[],
    userLoc?: { lat: number; lng: number },
  ) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    // Clear canvas
    ctx.fillStyle = "#1f2937"
    ctx.fillRect(0, 0, width, height)

    // Draw grid
    ctx.strokeStyle = "#374151"
    ctx.lineWidth = 1
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, height)
      ctx.stroke()
    }
    for (let i = 0; i < height; i += 50) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(width, i)
      ctx.stroke()
    }

    // Calculate bounds
    const latRange = 0.02 // ~2km
    const lngRange = 0.02

    // Draw user location
    if (userLoc) {
      const x = ((userLoc.lng - (center.lng - lngRange / 2)) / lngRange) * width
      const y = height - ((userLoc.lat - (center.lat - latRange / 2)) / latRange) * height

      ctx.fillStyle = "#10b981"
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, 2 * Math.PI)
      ctx.fill()

      ctx.fillStyle = "#ffffff"
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, 2 * Math.PI)
      ctx.fill()
    }

    // Draw location pins
    locations.forEach((location) => {
      const x = ((location.lng - (center.lng - lngRange / 2)) / lngRange) * width
      const y = height - ((location.lat - (center.lat - latRange / 2)) / latRange) * height

      ctx.fillStyle = location.type === "hotel" ? "#f59e0b" : "#8b5cf6"
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, 2 * Math.PI)
      ctx.fill()

      ctx.fillStyle = "#ffffff"
      ctx.font = "10px sans-serif"
      ctx.fillText(location.name.substring(0, 15), x + 10, y + 3)
    })
  }

  useEffect(() => {
    if (appState === "map" && mapCanvasRef.current && mapCenter) {
      drawMap(mapCanvasRef.current, mapCenter, locations, userLocation)
    }
  }, [appState, mapCenter, locations, userLocation])

  useEffect(() => {
    if (appState === "navigation" && navCanvasRef.current && userLocation && selectedLocation) {
      drawMap(navCanvasRef.current, userLocation, selectedLocation ? [selectedLocation] : [], userLocation)
    }
  }, [appState, userLocation, selectedLocation])

  const handleLogin = () => {
    if (armyNumber === "LAS1BC4" && password === "lakshay123") {
      setLoginError("")
      setAppState("location-request")
    } else {
      setLoginError("Invalid credentials. Please check your Army Number and Password.")
    }
  }

  const requestLocation = () => {
    setLocationError("")

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }
          setUserLocation(location)
          setMapCenter(location)
          setAppState("category")
        },
        (error) => {
          console.error("Geolocation error:", error)
          // Fallback to Delhi coordinates
          const delhiLocation = { lat: 28.6139, lng: 77.209 }
          setUserLocation(delhiLocation)
          setMapCenter(delhiLocation)
          setLocationError("Location access denied. Using Delhi as default location.")
          setAppState("category")
        },
      )
    } else {
      const delhiLocation = { lat: 28.6139, lng: 77.209 }
      setUserLocation(delhiLocation)
      setMapCenter(delhiLocation)
      setLocationError("Geolocation not supported. Using Delhi as default location.")
      setAppState("category")
    }
  }

  const selectCategory = async (category: "hotels" | "mt") => {
    setSelectedCategory(category)
    setIsLoading(true)
    setMapError("")

    if (mapCenter) {
      try {
        const places = await fetchNearbyPlaces(mapCenter.lat, mapCenter.lng, category === "hotels" ? "hotel" : "school")
        setLocations(places)
        setAppState("map")
      } catch (error) {
        setMapError("Failed to load locations. Please try again.")
        console.error("Error fetching places:", error)
      }
    }

    setIsLoading(false)
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsLoading(true)
    setMapError("")

    try {
      const coordinates = await geocodeLocation(searchQuery)
      if (coordinates) {
        setMapCenter(coordinates)
        if (selectedCategory) {
          const places = await fetchNearbyPlaces(
            coordinates.lat,
            coordinates.lng,
            selectedCategory === "hotels" ? "hotel" : "school",
          )
          setLocations(places)
        }
      } else {
        setMapError("Location not found. Please try a different search term.")
      }
    } catch (error) {
      setMapError("Search failed. Please check your connection and try again.")
      console.error("Search error:", error)
    }

    setIsLoading(false)
  }

  const selectLocationPin = async (location: Location) => {
    setSelectedLocation(location)
    setIsLoading(true)
    setRouteError("")

    if (userLocation) {
      try {
        const route = await calculateRoute(userLocation, { lat: location.lat, lng: location.lng })
        setRouteData(route)
        setAppState("navigation")
      } catch (error) {
        setRouteError("Failed to calculate route. Please try again.")
        console.error("Route calculation error:", error)
      }
    }

    setIsLoading(false)
  }

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
    setMapError("")
    setRouteError("")

    if (appState === "map" && selectedCategory && mapCenter) {
      selectCategory(selectedCategory)
    }
  }

  if (appState === "login") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Shield className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Raturi App</CardTitle>
            <p className="text-gray-400">Military Logistics System</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Army Number</label>
              <Input
                type="text"
                value={armyNumber}
                onChange={(e) => setArmyNumber(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white"
                placeholder="Enter Army Number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-700 border-gray-600 text-white"
                placeholder="Enter Password"
              />
            </div>
            {loginError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {loginError}
              </div>
            )}
            <Button onClick={handleLogin} className="w-full bg-green-600 hover:bg-green-700">
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (appState === "location-request") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <MapPin className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle className="text-xl font-bold text-white">Location Access</CardTitle>
            <p className="text-gray-400">We need your location to show nearby services</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {locationError && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {locationError}
              </div>
            )}
            <Button onClick={requestLocation} className="w-full bg-green-600 hover:bg-green-700">
              Allow Location Access
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (appState === "category") {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-bold text-white">Select Service</CardTitle>
            <p className="text-gray-400">Choose the type of service you need</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => selectCategory("hotels")}
              disabled={isLoading}
              className="w-full h-16 bg-amber-600 hover:bg-amber-700 flex items-center justify-center gap-3"
            >
              {isLoading && selectedCategory === "hotels" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Users className="h-6 w-6" />
              )}
              <span className="text-lg">Hotels For Troops</span>
            </Button>
            <Button
              onClick={() => selectCategory("mt")}
              disabled={isLoading}
              className="w-full h-16 bg-purple-600 hover:bg-purple-700 flex items-center justify-center gap-3"
            >
              {isLoading && selectedCategory === "mt" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Truck className="h-6 w-6" />
              )}
              <span className="text-lg">MT Services</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (appState === "map") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <Button
              onClick={() => setAppState("category")}
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300"
            >
              ← Back
            </Button>
            <h1 className="text-lg font-semibold text-white">
              {selectedCategory === "hotels" ? "Hotels" : "Schools"} Near You
            </h1>
            <div className="flex items-center gap-2">
              {!isOnline && <WifiOff className="h-4 w-4 text-red-400" />}
              {isOnline && <Wifi className="h-4 w-4 text-green-400" />}
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search location..."
              className="bg-gray-700 border-gray-600 text-white"
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
        </div>

        <div className="flex-1 p-4">
          <div className="bg-gray-800 rounded-lg p-4 h-96 border border-gray-700">
            {mapError ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                <p className="text-red-400 mb-4">{mapError}</p>
                <Button onClick={handleRetry} className="bg-green-600 hover:bg-green-700">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : (
              <canvas
                ref={mapCanvasRef}
                width={400}
                height={300}
                className="w-full h-full rounded cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const x = e.clientX - rect.left
                  const y = e.clientY - rect.top

                  // Simple click detection for locations
                  locations.forEach((location) => {
                    if (mapCenter) {
                      const latRange = 0.02
                      const lngRange = 0.02
                      const locX = ((location.lng - (mapCenter.lng - lngRange / 2)) / lngRange) * rect.width
                      const locY =
                        rect.height - ((location.lat - (mapCenter.lat - latRange / 2)) / latRange) * rect.height

                      if (Math.abs(x - locX) < 15 && Math.abs(y - locY) < 15) {
                        selectLocationPin(location)
                      }
                    }
                  })
                }}
              />
            )}
          </div>

          {locations.length > 0 && (
            <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
              {locations.map((location) => (
                <div
                  key={location.id}
                  onClick={() => selectLocationPin(location)}
                  className="bg-gray-800 p-3 rounded-lg border border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-white">{location.name}</h3>
                      <p className="text-sm text-gray-400">{location.address}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {location.rating && (
                        <span className="text-yellow-400 text-sm">★ {location.rating.toFixed(1)}</span>
                      )}
                      <MapPin
                        className={`h-4 w-4 ${location.type === "hotel" ? "text-amber-400" : "text-purple-400"}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (appState === "navigation") {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <Button
              onClick={() => setAppState("map")}
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-300"
            >
              ← Back to Map
            </Button>
            <h1 className="text-lg font-semibold text-white">Navigation</h1>
            <div className="flex items-center gap-2">
              {!isOnline && <WifiOff className="h-4 w-4 text-red-400" />}
              {isOnline && <Wifi className="h-4 w-4 text-green-400" />}
            </div>
          </div>

          {selectedLocation && (
            <div className="bg-gray-700 p-3 rounded-lg">
              <h2 className="font-medium text-white">{selectedLocation.name}</h2>
              <p className="text-sm text-gray-400">{selectedLocation.address}</p>
            </div>
          )}
        </div>

        <div className="flex-1 p-4">
          {routeError ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <p className="text-red-400 mb-4">{routeError}</p>
              <Button onClick={handleRetry} className="bg-green-600 hover:bg-green-700">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="bg-gray-800 rounded-lg p-4 h-48 border border-gray-700 mb-4">
                <canvas ref={navCanvasRef} width={400} height={180} className="w-full h-full rounded" />
              </div>

              {routeData && (
                <div className="space-y-4">
                  <div className="flex gap-4 text-center">
                    <div className="bg-gray-800 p-3 rounded-lg flex-1">
                      <Route className="h-6 w-6 text-blue-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Distance</p>
                      <p className="text-lg font-semibold text-white">{routeData.distance}</p>
                    </div>
                    <div className="bg-gray-800 p-3 rounded-lg flex-1">
                      <Clock className="h-6 w-6 text-green-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">Duration</p>
                      <p className="text-lg font-semibold text-white">{routeData.duration}</p>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                      <Navigation className="h-5 w-5 text-blue-400" />
                      Turn-by-Turn Directions
                    </h3>
                    <div className="space-y-3">
                      {routeData.steps.map((step, index) => (
                        <div key={index} className="flex items-start gap-3 p-2 bg-gray-700 rounded">
                          <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-white text-sm">{step.instruction}</p>
                            <p className="text-gray-400 text-xs">
                              {step.distance} • {step.duration}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return null
}
