import { describe, it, expect } from 'vitest'
import { maskCep, cepDigits, missingAddressFields, EMPTY_ADDRESS } from '../lib/deliveryAddress'

describe('deliveryAddress', () => {
  it('mascara o CEP enquanto digita e corta em 8 dígitos', () => {
    expect(maskCep('60')).toBe('60')
    expect(maskCep('600001')).toBe('60000-1')
    expect(maskCep('60000-000123')).toBe('60000-000')
    expect(cepDigits('60000-000')).toBe('60000000')
  })

  it('exige rua, número, bairro, referência, cidade e UF; complemento e CEP são opcionais', () => {
    expect(missingAddressFields(EMPTY_ADDRESS)).toEqual(['street', 'number', 'district', 'reference', 'city', 'state'])
    expect(missingAddressFields({
      ...EMPTY_ADDRESS, street: 'Rua A', number: '1', district: 'Centro', reference: 'Praça', city: 'Fortaleza', state: 'CE',
    })).toEqual([])
  })
})
