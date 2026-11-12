import { describe, expect, it } from 'vitest'

import { buildMapsUrl } from './maps'

describe('buildMapsUrl', () => {
  it('links by WGS-84 coordinates when available', () => {
    expect(
      buildMapsUrl({
        name: 'BK-88 Arena – Court 1',
        address: '88 Phan Đăng Lưu, Bình Thạnh',
        lat: 10.8033,
        lng: 106.687,
      }),
    ).toBe('https://www.google.com/maps/search/?api=1&query=10.8033%2C106.687')
  })

  it('falls back to a name + address text search without coordinates', () => {
    expect(buildMapsUrl({ name: 'Sân Kỳ Hòa', address: '6 Cao Thắng, District 3' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=S%C3%A2n%20K%E1%BB%B3%20H%C3%B2a%206%20Cao%20Th%E1%BA%AFng%2C%20District%203',
    )
  })

  it('searches by address alone when the name is absent', () => {
    expect(buildMapsUrl({ address: 'Hanoi' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Hanoi',
    )
  })
})
