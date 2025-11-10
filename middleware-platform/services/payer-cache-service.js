/**
 * PAYER CACHE SERVICE
 * Manages caching of insurance payers from Stedi to minimize API calls
 * 
 * Strategy:
 * 1. Check DB cache first (fast, free)
 * 2. If not found or stale, fetch from Stedi (costs API call)
 * 3. Update cache for future use
 */

const db = require('../database');
const InsuranceService = require('./insurance-service');
const { v4: uuidv4 } = require('uuid');

class PayerCacheService {
  // Cache settings
  static CACHE_TTL_DAYS = 30; // Refresh payer list every 30 days
  static MAX_CACHE_SIZE = 10000; // Maximum payers to cache

  /**
   * Search for a payer by name (checks cache first, then Stedi)
   * @param {string} searchTerm - Payer name to search for
   * @returns {Object} Payer information
   */
  static async searchPayer(searchTerm) {
    try {
      console.log(`\n🔍 PAYER CACHE: Searching for "${searchTerm}"`);

      // Step 1: Check database cache first (FREE)
      const cachedResults = db.searchPayersByName(searchTerm);

      if (cachedResults && cachedResults.length > 0) {
        console.log(`✅ Found ${cachedResults.length} payer(s) in cache (no API call)`);
        return {
          success: true,
          payers: cachedResults,
          count: cachedResults.length,
          fromCache: true,
          apiCallSaved: true
        };
      }

      // Step 2: Not in cache, fetch from Stedi (COSTS API CALL)
      console.log(`⚠️  Not in cache, fetching from Stedi API...`);
      let stediResult;
      try {
        stediResult = await InsuranceService.searchPayer(searchTerm);
      } catch (apiError) {
        console.warn(`⚠️  Stedi API call failed: ${apiError.message}`);
        // API failed - try fallback to known payers
        const knownPayers = this._getKnownPayers();
        const matchedPayer = knownPayers.find(p =>
          p.payer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          searchTerm.toLowerCase().includes(p.payer_name.toLowerCase())
        );

        if (matchedPayer) {
          console.log(`✅ Using known payer fallback due to API failure: ${matchedPayer.payer_name}`);
          return {
            success: true,
            payers: [matchedPayer],
            count: 1,
            fromCache: false,
            apiCallSaved: false,
            fromFallback: true,
            apiError: apiError.message
          };
        }

        // No fallback match - return error
        return {
          success: false,
          payers: [],
          count: 0,
          error: `Unable to connect to insurance database. ${apiError.message}`,
          fromCache: false,
          apiCallSaved: false
        };
      }

      if (stediResult.success && stediResult.payers.length > 0) {
        // Step 3: Cache the results for future use
        console.log(`💾 Caching ${stediResult.payers.length} payer(s) for future use...`);
        stediResult.payers.forEach(payer => {
          this._cachePayer(payer);
        });

        return {
          ...stediResult,
          fromCache: false,
          apiCallSaved: false
        };
      }

      return {
        success: false,
        payers: [],
        count: 0,
        error: stediResult.error || 'No payers found',
        fromCache: false,
        apiCallSaved: false
      };

    } catch (error) {
      console.error('❌ Error searching payer:', error.message);
      return {
        success: false,
        payers: [],
        count: 0,
        error: error.message,
        fromCache: false,
        apiCallSaved: false
      };
    }
  }

  /**
   * Get payer by payer_id (checks cache first)
   * @param {string} payerId - Payer ID
   * @returns {Object} Payer information
   */
  static async getPayerById(payerId) {
    try {
      // Step 1: Check cache first
      const cached = db.getPayerByPayerId(payerId);

      if (cached) {
        console.log(`✅ Found payer ${payerId} in cache (no API call)`);
        return {
          success: true,
          payer: cached,
          fromCache: true,
          apiCallSaved: true
        };
      }

      // Step 2: Not in cache, need to search Stedi
      // This is expensive - we'd need to search by ID or fetch all
      // For now, return not found
      console.log(`⚠️  Payer ${payerId} not in cache`);
      return {
        success: false,
        payer: null,
        error: 'Payer not found in cache. Use searchPayer to find and cache it.',
        fromCache: false,
        apiCallSaved: false
      };

    } catch (error) {
      console.error('❌ Error getting payer:', error.message);
      return {
        success: false,
        payer: null,
        error: error.message,
        fromCache: false,
        apiCallSaved: false
      };
    }
  }

  /**
   * Validate and confirm payer name and member ID
   * Used by voice agent to confirm insurance details
   * @param {string} payerName - Patient-provided payer name
   * @param {string} memberId - Patient-provided member ID
   * @returns {Object} Validation result with confirmed payer info
   */
  static async validatePatientInsurance(payerName, memberId) {
    try {
      console.log(`\n✅ PAYER CACHE: Validating Insurance`);
      console.log(`   Payer Name: ${payerName}`);
      console.log(`   Member ID: ${memberId}`);

      // Step 1: Search for payer in cache (or Stedi if not cached)
      let searchResult = await this.searchPayer(payerName);

      // If API call failed, try fallback to known payers
      if (!searchResult.success || searchResult.payers.length === 0) {
        console.log(`⚠️  Payer search failed or returned no results. Trying fallback...`);

        // Fallback: Check database cache directly
        const cachedPayers = db.searchPayersByName(payerName);
        if (cachedPayers && cachedPayers.length > 0) {
          console.log(`✅ Found ${cachedPayers.length} payer(s) in database cache (fallback)`);
          searchResult = {
            success: true,
            payers: cachedPayers,
            count: cachedPayers.length,
            fromCache: true,
            apiCallSaved: true
          };
        } else {
          // Final fallback: Use known common payers for demo
          const knownPayers = this._getKnownPayers();
          const matchedPayer = knownPayers.find(p =>
            p.payer_name.toLowerCase().includes(payerName.toLowerCase()) ||
            payerName.toLowerCase().includes(p.payer_name.toLowerCase())
          );

          if (matchedPayer) {
            console.log(`✅ Using known payer fallback: ${matchedPayer.payer_name}`);
            searchResult = {
              success: true,
              payers: [matchedPayer],
              count: 1,
              fromCache: false,
              apiCallSaved: false,
              fromFallback: true
            };
          }
        }
      }

      if (!searchResult.success || searchResult.payers.length === 0) {
        return {
          success: false,
          confirmed: false,
          error: 'Insurance provider not found. Please provide the full name of your insurance company.',
          suggestions: []
        };
      }

      // Step 2: If multiple matches, return suggestions
      if (searchResult.payers.length > 1) {
        const suggestions = searchResult.payers.map(p => ({
          payer_id: p.payer_id,
          payer_name: p.payer_name,
          aliases: p.aliases ? JSON.parse(p.aliases) : []
        }));

        return {
          success: true,
          confirmed: false,
          multipleMatches: true,
          suggestions: suggestions,
          message: `Found ${searchResult.payers.length} matching insurance providers. Please confirm which one:`,
          apiCallSaved: searchResult.apiCallSaved
        };
      }

      // Step 3: Single match - confirm
      const payer = searchResult.payers[0];

      return {
        success: true,
        confirmed: true,
        payer_id: payer.payer_id,
        payer_name: payer.payer_name || payer.payerName,
        member_id: memberId,
        message: `Confirmed: ${payer.payer_name || payer.payerName}`,
        apiCallSaved: searchResult.apiCallSaved
      };

    } catch (error) {
      console.error('❌ Error validating insurance:', error.message);
      return {
        success: false,
        confirmed: false,
        error: error.message
      };
    }
  }

  /**
   * Sync payer list from Stedi (background job)
   * Call this periodically to refresh the cache
   * @param {number} limit - Maximum number of payers to fetch
   * @returns {Object} Sync result
   */
  static async syncPayerList(limit = 1000) {
    try {
      console.log(`\n🔄 PAYER CACHE: Syncing payer list from Stedi (limit: ${limit})`);

      // Fetch from Stedi
      const result = await InsuranceService.getAllPayers(limit);

      if (!result.success || result.payers.length === 0) {
        return {
          success: false,
          error: result.error || 'No payers fetched',
          cached: 0
        };
      }

      // Cache all payers
      let cachedCount = 0;
      result.payers.forEach(payer => {
        try {
          this._cachePayer(payer);
          cachedCount++;
        } catch (cacheError) {
          console.warn(`⚠️  Failed to cache payer ${payer.payer_id}: ${cacheError.message}`);
        }
      });

      console.log(`✅ Cached ${cachedCount} payers`);

      return {
        success: true,
        fetched: result.payers.length,
        cached: cachedCount,
        cacheSize: db.getPayerCacheCount()
      };

    } catch (error) {
      console.error('❌ Error syncing payer list:', error.message);
      return {
        success: false,
        error: error.message,
        cached: 0
      };
    }
  }

  /**
   * Get known/common payers for fallback when API is unavailable
   * @private
   */
  static _getKnownPayers() {
    return [
      {
        payer_id: 'CIGNA',
        payer_name: 'Cigna',
        aliases: JSON.stringify(['CIGNA', 'Cigna Health', 'Cigna Healthcare'])
      },
      {
        payer_id: 'AETNA',
        payer_name: 'Aetna',
        aliases: JSON.stringify(['AETNA', 'Aetna Health', 'Aetna Inc'])
      },
      {
        payer_id: 'BCBS',
        payer_name: 'Blue Cross Blue Shield',
        aliases: JSON.stringify(['BCBS', 'Blue Cross', 'Blue Shield', 'Anthem'])
      },
      {
        payer_id: 'UNITED',
        payer_name: 'UnitedHealthcare',
        aliases: JSON.stringify(['UnitedHealth', 'UHC', 'United Health'])
      },
      {
        payer_id: 'HUMANA',
        payer_name: 'Humana',
        aliases: JSON.stringify(['HUMANA', 'Humana Inc'])
      }
    ];
  }

  /**
   * Cache a single payer (private helper)
   * @private
   */
  static _cachePayer(payer) {
    try {
      const payerId = payer.payer_id || payer.id || payer.payerId;
      const payerName = payer.payer_name || payer.payerName || payer.name || 'Unknown';

      if (!payerId) {
        console.warn('⚠️  Cannot cache payer: missing payer_id');
        return;
      }

      db.upsertPayer({
        id: uuidv4(),
        payer_id: payerId,
        payer_name: payerName,
        aliases: payer.aliases || payer.alias || null,
        supported_transactions: payer.supportedTransactions || payer.transactions || null,
        is_active: true
      });

    } catch (error) {
      console.error(`❌ Error caching payer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getCacheStats() {
    const count = db.getPayerCacheCount();
    const allPayers = db.getAllCachedPayers(100);

    return {
      totalCached: count,
      samplePayers: allPayers.slice(0, 10).map(p => ({
        payer_id: p.payer_id,
        payer_name: p.payer_name
      }))
    };
  }
}

module.exports = PayerCacheService;

