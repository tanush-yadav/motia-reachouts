import { atom, useAtom } from 'jotai'

import { Mail } from '../app/data'

type Config = {
  selected: Mail['id'] | null
}

const configAtom = atom<Config>({
  selected: null,
})

export function useMail() {
  return useAtom(configAtom)
}
