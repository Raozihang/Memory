export interface Photo {
  id: string
  album_id: string
  filename: string
  storage_key: string
  medium_key?: string
  thumb_key?: string
  display_key?: string
  mime: string
  bytes: number
  taken_at: string
  created_at: string
}

export interface Album {
  id: string
  title: string
  description?: string
  cover_photo_id?: string | null
}

export interface AlbumWithCover extends Album {
  cover_photo?: Photo | null
}

export interface PhotosPage {
  items: Photo[]
  total?: number
  limit: number
  offset: number
  nextOffset?: number | null
  hasMore?: boolean
}

export interface ExifData {
  photo_id: string
  exif_json: any
}

export interface TimelineResponse {
  [date: string]: Photo[]
}
