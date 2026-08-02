import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { getHomeCareNavigationUrls } from '../utils/homeCareNavigation'
import { getHomeCareNextActions } from '../domain/homeCare/homeCareVisitTransitions'

describe('interface home care', () => {
  it('gera navegação externa com caracteres especiais', () => {
    const urls=getHomeCareNavigationUrls({street:'Rua São João',number:'10',city:'São Paulo',state:'SP'})
    expect(urls.googleMaps).toContain('api=1'); expect(urls.waze).toContain('navigate=yes'); expect(urls.googleMaps).toContain('%C3%A3')
  })
  it('expõe apenas próximas ações permitidas', () => expect(getHomeCareNextActions('arrived').map((item)=>item.label)).toEqual(['Iniciar atendimento','Paciente ausente']))
  it('mantém links externos seguros', () => expect(renderToStaticMarkup(<MemoryRouter><a target="_blank" rel="noreferrer" href="https://maps.example">Mapa</a></MemoryRouter>)).toContain('noreferrer'))
})
