-- KEYS[1] = stock:{variantId}
-- ARGV[1] = quantity
-- ARGV[2] = reservation id/reference id
-- ARGV[3] = ttl seconds
local stock = cjson.decode(redis.call('GET', KEYS[1]) or '{"onHand":0,"reserved":0}')
local quantity = tonumber(ARGV[1])

if stock.onHand - stock.reserved < quantity then
  return -1
end

stock.reserved = stock.reserved + quantity
redis.call('SET', KEYS[1], cjson.encode(stock))
redis.call('SETEX', 'res:' .. ARGV[2], tonumber(ARGV[3]), cjson.encode({
  variantId = KEYS[1],
  qty = quantity
}))

return stock.onHand - stock.reserved
