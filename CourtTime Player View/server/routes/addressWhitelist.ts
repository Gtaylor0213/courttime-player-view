import express from 'express';
import {
  getWhitelistedAddresses,
  addWhitelistedAddress,
  bulkAddWhitelistedAddresses,
  removeWhitelistedAddress,
  updateAccountsLimit,
  isAddressWhitelisted,
  getAccountCountAtAddress
} from '../../src/services/addressWhitelistService';

const router = express.Router();

/**
 * GET /api/address-whitelist/:facilityId
 * Get all whitelisted addresses for a facility
 */
router.get('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const addresses = await getWhitelistedAddresses(facilityId);

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/address-whitelist/:facilityId
 * Add an address to the whitelist
 */
router.post('/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { address, accountsLimit } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address is required'
      });
    }

    const result = await addWhitelistedAddress(
      facilityId,
      address,
      accountsLimit || 4
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/address-whitelist/:facilityId/bulk
 * Bulk import addresses to the whitelist
 */
router.post('/:facilityId/bulk', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { addresses } = req.body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Addresses array is required'
      });
    }

    const result = await bulkAddWhitelistedAddresses(facilityId, addresses);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/address-whitelist/:facilityId/:addressId
 * Remove an address from the whitelist
 */
router.delete('/:facilityId/:addressId', async (req, res, next) => {
  try {
    const { facilityId, addressId } = req.params;

    const result = await removeWhitelistedAddress(facilityId, addressId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/address-whitelist/:facilityId/:addressId
 * Update the accounts limit for an address
 */
router.patch('/:facilityId/:addressId', async (req, res, next) => {
  try {
    const { facilityId, addressId } = req.params;
    const { accountsLimit } = req.body;

    if (!accountsLimit || accountsLimit < 1) {
      return res.status(400).json({
        success: false,
        error: 'Valid accounts limit is required'
      });
    }

    const result = await updateAccountsLimit(facilityId, addressId, accountsLimit);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/address-whitelist/:facilityId/check/:address
 * Check if an address is whitelisted
 */
router.get('/:facilityId/check/:address', async (req, res, next) => {
  try {
    const { facilityId, address } = req.params;

    const result = await isAddressWhitelisted(facilityId, decodeURIComponent(address));

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/address-whitelist/:facilityId/count/:address
 * Get count of accounts at an address
 */
router.get('/:facilityId/count/:address', async (req, res, next) => {
  try {
    const { facilityId, address } = req.params;

    const count = await getAccountCountAtAddress(facilityId, decodeURIComponent(address));

    res.json({
      success: true,
      count
    });
  } catch (error) {
    next(error);
  }
});

export default router;
