'use strict';
const { json, authorize } = require('../../lib/github');
const { listAddresses } = require('../../lib/addresses');

exports.handler = async (event) => {
  const denied = await authorize(event); if (denied) return denied;
  try { return json(200, { addresses: await listAddresses() }); }
  catch (e) { return json(502, { error: 'Could not load addresses: ' + e.message }); }
};
