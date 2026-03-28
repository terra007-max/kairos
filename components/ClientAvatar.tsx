import { type Client } from '@/lib/types'

export function ClientAvatar({ client, size = 36 }: { client: Pick<Client, 'name' | 'color' | 'logo_url'>; size?: number }) {
  if (client.logo_url) {
    return (
      <img
        src={client.logo_url}
        alt={client.name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size, borderRadius: 10, backgroundColor: client.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span style={{ fontSize: size * 0.38, color: 'white', fontWeight: 700 }}>{client.name[0].toUpperCase()}</span>
    </div>
  )
}
