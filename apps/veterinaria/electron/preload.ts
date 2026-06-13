import { contextBridge } from 'electron'

// Ponte segura mínima. Os handlers de domínio (pets, tutores, consultas...)
// e os da plataforma (licença, auth) entram conforme o app cresce.
contextBridge.exposeInMainWorld('vetApi', {})
