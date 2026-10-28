import { describe, it, expect } from 'vitest'
import {
  maskCep, cepDigits, missingAddressFields, EMPTY_ADDRESS, isAddressComplete,
  matchNeighborhood, deliveryFeeFor, type Neighborhood,
} from '../lib/deliveryAddress'

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

  describe('bairros e taxa de entrega', () => {
    const hoods: Neighborhood[] = [
      { _id: 'a1', name: 'Centro', fee: 5 },
      { _id: 'b2', name: 'São João', fee: 7.5 },
    ]
    const base = {
      ...EMPTY_ADDRESS, street: 'Rua A', number: '1', district: 'Centro', reference: 'Praça', city: 'Fortaleza', state: 'CE',
    }

    it('com bairros cadastrados, o bairro tem de ser um deles', () => {
      expect(missingAddressFields(base, hoods)).toEqual(['district'])
      expect(missingAddressFields({ ...base, neighborhoodId: 'zzz' }, hoods)).toEqual(['district'])
      expect(missingAddressFields({ ...base, neighborhoodId: 'a1' }, hoods)).toEqual([])
      expect(isAddressComplete({ ...base, neighborhoodId: 'a1' }, hoods)).toBe(true)
    })

    it('sem bairros cadastrados vale o bairro digitado, como antes', () => {
      expect(missingAddressFields(base, [])).toEqual([])
      expect(isAddressComplete(base)).toBe(true)
    })

    it('a taxa vem do bairro escolhido; 0 sem bairro ou fora da lista', () => {
      expect(deliveryFeeFor({ ...base, neighborhoodId: 'b2' }, hoods)).toBe(7.5)
      expect(deliveryFeeFor({ ...base, neighborhoodId: 'x' }, hoods)).toBe(0)
      expect(deliveryFeeFor(null, hoods)).toBe(0)
      expect(deliveryFeeFor({ ...base, neighborhoodId: 'a1' }, [])).toBe(0)
    })

    it('reconhece o bairro do ViaCEP ignorando acento e caixa', () => {
      expect(matchNeighborhood('sao joao', hoods)?._id).toBe('b2')
      expect(matchNeighborhood(' CENTRO ', hoods)?._id).toBe('a1')
      expect(matchNeighborhood('Aldeota', hoods)).toBeNull()
      expect(matchNeighborhood('', hoods)).toBeNull()
    })
  })
})
