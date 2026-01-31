import axios from 'axios';

const recentAdsCache = {};

export async function getRecentTradeAds(limit = 100) {
    const cacheKey = `recent_ads_${limit}`;
    const now = Date.now();

    // Check cache first (cache for 30 seconds since ads change frequently)
    if (recentAdsCache[cacheKey] && (now - recentAdsCache[cacheKey].timestamp) < 1000) {
        return recentAdsCache[cacheKey].data;
    }

    try {
        //console.log(`[api] Fetching ${limit} recent trade ads...`);
        const response = await axios.get(`https://api.rolimons.com/tradeads/v1/getrecentads?limit=${limit}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // Log the actual response for debugging
        //console.log(`[api] Raw response data keys:`, Object.keys(response.data || {}));
        //console.log(`[api] Response status:`, response.status);

        // Try different possible response structures
        let ads = null;
        if (response.data && response.data.trade_ads && Array.isArray(response.data.trade_ads)) {
            // New structure: { trade_ads: [...] }
            ads = response.data.trade_ads;
            //console.log(`[api] Found trade_ads array with ${ads.length} ads`);
        } else if (response.data && response.data.ads) {
            // Expected structure: { ads: [...] }
            ads = response.data.ads;
        } else if (response.data && Array.isArray(response.data)) {
            // Alternative structure: direct array
            ads = response.data;
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
            // Another possible structure: { data: [...] }
            ads = response.data.data;
        } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
            // Check if any property contains an array
            for (const key in response.data) {
                if (Array.isArray(response.data[key])) {
                    //console.log(`[api] Found array in property: ${key}`);
                    ads = response.data[key];
                    break;
                }
            }
        }

        if (ads && Array.isArray(ads)) {
            //console.log(`[api] Successfully fetched ${ads.length} recent trade ads`);

            // Validate that ads have expected structure
            if (ads.length > 0) {
                const sampleAd = ads[0];
                //console.log(`[api] Sample ad keys:`, Object.keys(sampleAd));
                //console.log(`[api] Sample ad has offer_item_ids:`, !!sampleAd.offer_item_ids);
                //console.log(`[api] Sample ad has request_item_ids:`, !!sampleAd.request_item_ids);
            }

            // Cache the response
            recentAdsCache[cacheKey] = {
                data: ads,
                timestamp: now
            };

            return ads;
        } else {
            console.error('[API] Invalid response from recent ads API - no ads array found');
            console.error('[API] Response data structure:', typeof response.data, Array.isArray(response.data) ? 'array' : 'object');
            if (response.data && typeof response.data === 'object') {
                console.error('[API] Response data keys:', Object.keys(response.data));
            }
            return null;
        }
    } catch (error) {
        console.error('[API] Error fetching recent trade ads:', error.message);
        return null;
    }
}