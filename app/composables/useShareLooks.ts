export interface SharePhoto {
  url: string
  /** What the photo shows (Frente, Espalda…); it goes into the file name */
  label: string
}

export interface SharePayload {
  /** Photos to attach, in order */
  photos: SharePhoto[]
  /** Drag name of whoever owns the look; it goes into the file names */
  owner: string
  /** Message that goes with the photos */
  text: string
}

export type ShareResult = 'shared' | 'copied' | 'cancelled'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function downloadBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo descargar una de las fotos.')
  return response.blob()
}

/** Lowercase ASCII without accents, words joined by `separator` ("Ana Conda" → "ana_conda") */
function slugify(text: string, separator: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(separator)
}

/**
 * Sortable file name ("01-frente-ana_conda.webp", "02-espalda-ana_conda.webp"…):
 * apps that order the attachments by name, and people who save them, get the
 * photos in the right order, and know whose look they are.
 */
function fileName(blob: Blob, index: number, label: string, owner: string): string {
  const extension = MIME_EXTENSIONS[blob.type] ?? 'jpg'
  const parts = [slugify(label, '-') || 'look', slugify(owner, '_')].filter(Boolean)
  return `${String(index + 1).padStart(2, '0')}-${parts.join('-')}.${extension}`
}

/**
 * Shares a look through the native share sheet (Android / iOS) so it can be sent
 * straight to a WhatsApp chat. Where files cannot be shared (desktop browsers) the
 * text is copied to the clipboard instead.
 *
 * Images are downloaded ahead of time with `prefetch`: browsers only allow
 * `navigator.share` shortly after a tap, so there is no time to fetch on click.
 */
export function useShareLooks() {
  const sharing = ref(false)
  const cache = new Map<string, Promise<Blob>>()

  function blobFor(url: string): Promise<Blob> {
    let blob = cache.get(url)
    if (!blob) {
      blob = downloadBlob(url)
      // A failed download must be retried on the next attempt
      blob.catch(() => cache.delete(url))
      cache.set(url, blob)
    }
    return blob
  }

  function prefetch(photos: SharePhoto[]) {
    photos.forEach(photo => blobFor(photo.url).catch(() => {}))
  }

  async function share({ photos, owner, text }: SharePayload): Promise<ShareResult> {
    sharing.value = true

    try {
      // Named after their position, so the order survives wherever the files go
      const files = await Promise.all(photos.map(async (photo, index) => {
        const blob = await blobFor(photo.url)
        return new File([blob], fileName(blob, index, photo.label, owner), { type: blob.type || 'image/jpeg' })
      }))

      if (navigator.canShare?.({ files })) {
        await navigator.share({ files, text })
        return 'shared'
      }

      await navigator.clipboard.writeText(text)
      return 'copied'
    }
    catch (error) {
      // Closing the share sheet is not an error
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      throw error
    }
    finally {
      sharing.value = false
    }
  }

  return { sharing, prefetch, share }
}
