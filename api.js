import axios from 'axios';

const recentAdsCache = {};

export async function getRecentTradeAds(limit = 100) {
    const cacheKey = `recent_ads_${limit}`;
    const now = Date.now();

    if (recentAdsCache[cacheKey] && (now - recentAdsCache[cacheKey].timestamp) < 1000) {
        return recentAdsCache[cacheKey].data;
    }

    try {
        const response = await axios.get(`https://api.rolimons.com/tradeads/v1/getrecentads?limit=${limit}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        let ads = null;
        if (response.data && response.data.trade_ads && Array.isArray(response.data.trade_ads)) {
            ads = response.data.trade_ads;
        } else if (response.data && response.data.ads) {
            ads = response.data.ads;
        } else if (response.data && Array.isArray(response.data)) {
            ads = response.data;
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
            ads = response.data.data;
        } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
            for (const key in response.data) {
                if (Array.isArray(response.data[key])) {
                    ads = response.data[key];
                    break;
                }
            }
        }

        if (ads && Array.isArray(ads)) {
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