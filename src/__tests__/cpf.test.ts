/**
 * Testes de CPF — validação, máscara e estado para a interface.
 *
 * CPF errado vai para a nota fiscal e o cliente só descobre no caixa. Por isso
 * o campo é opcional mas, se preenchido, tem de estar correto.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidCPF, formatCPF, maskCPFInput, cpfState, CPF_MESSAGE,
} from '../lib/client_storage'

// CPFs válidos de teste — dígitos verificadores conferem
const VALIDOS = ['52998224725', '11144477735', '12345678909']

describe('isValidCPF', () => {
  it.each(VALIDOS)('aceita CPF válido: %s', (cpf) => {
    expect(isValidCPF(cpf)).toBe(true)
  })

  it('aceita CPF válido já formatado', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true)
  })

  it('recusa último dígito errado', () => {
    expect(isValidCPF('52998224724')).toBe(false)
  })

  it('recusa primeiro dígito verificador errado', () => {
    expect(isValidCPF('52998224715')).toBe(false)
  })

  // Sequências repetidas passam na conta dos dígitos verificadores, mas não são
  // CPFs reais — a Receita não emite. Sem esta checagem, 111.111.111-11 entraria.
  it.each([
    '00000000000', '11111111111', '22222222222', '33333333333',
    '44444444444', '55555555555', '66666666666', '77777777777',
    '88888888888', '99999999999',
  ])('recusa sequência repetida: %s', (cpf) => {
    expect(isValidCPF(cpf)).toBe(false)
  })

  it.each([
    ['', 'vazio'],
    ['123456789', 'curto (9 dígitos)'],
    ['1234567890', 'curto (10 dígitos)'],
    ['123456789012', 'longo (12 dígitos)'],
    ['abcdefghijk', 'letras'],
    ['529.982.247-2', 'formatado incompleto'],
  ])('recusa %s — %s', (cpf) => {
    expect(isValidCPF(cpf)).toBe(false)
  })
})

describe('maskCPFInput', () => {
  it('formata progressivamente conforme digita', () => {
    expect(maskCPFInput('5')).toBe('5')
    expect(maskCPFInput('529')).toBe('529')
    expect(maskCPFInput('5299')).toBe('529.9')
    expect(maskCPFInput('529982')).toBe('529.982')
    expect(maskCPFInput('5299822')).toBe('529.982.2')
    expect(maskCPFInput('529982247')).toBe('529.982.247')
    expect(maskCPFInput('5299822472')).toBe('529.982.247-2')
    expect(maskCPFInput('52998224725')).toBe('529.982.247-25')
  })

  // Sem o corte, o campo aceita 15 números, o cliente não vê problema e o CPF
  // chega truncado na nota
  it('corta em 11 dígitos', () => {
    expect(maskCPFInput('529982247259999')).toBe('529.982.247-25')
  })

  it('ignora letras e símbolos digitados', () => {
    expect(maskCPFInput('52a9b9.8/2-2c47 25')).toBe('529.982.247-25')
  })

  it('é idempotente sobre o próprio resultado', () => {
    const once = maskCPFInput('52998224725')
    expect(maskCPFInput(once)).toBe(once)
  })

  it('apagar caracteres reduz a máscara', () => {
    expect(maskCPFInput('529.982.24')).toBe('529.982.24')
    expect(maskCPFInput('529.98')).toBe('529.98')
  })
})

describe('cpfState', () => {
  it('vazio → empty (campo é opcional, não é erro)', () => {
    expect(cpfState('')).toBe('empty')
    expect(cpfState('   ')).toBe('empty')
  })

  it('menos de 11 dígitos → incomplete', () => {
    expect(cpfState('529')).toBe('incomplete')
    expect(cpfState('529.982.247-2')).toBe('incomplete')
  })

  it('11 dígitos com verificador errado → invalid', () => {
    expect(cpfState('529.982.247-24')).toBe('invalid')
  })

  it('11 dígitos corretos → valid', () => {
    expect(cpfState('529.982.247-25')).toBe('valid')
  })

  it('mensagem só existe para os estados de erro', () => {
    expect(CPF_MESSAGE.empty).toBeUndefined()
    expect(CPF_MESSAGE.valid).toBeUndefined()
    expect(CPF_MESSAGE.incomplete).toBeTruthy()
    expect(CPF_MESSAGE.invalid).toBeTruthy()
  })
})

describe('formatCPF', () => {
  it('formata 11 dígitos', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25')
  })

  it('devolve como veio quando não tem 11 dígitos', () => {
    expect(formatCPF('529')).toBe('529')
  })
})
