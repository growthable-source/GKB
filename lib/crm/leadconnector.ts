/**
 * LeadConnector / GoHighLevel contact upsert.
 *
 * Signups land in one nominated sub-account as leads, carrying everything the
 * survey collected.
 *
 * The awkward part of this API is custom fields: v2 addresses them by
 * per-location field id, which cannot be known from here without reading the
 * account. So the answers travel as TAGS plus the handful of first-class fields
 * every location has (companyName, source). That is not a workaround — tags are
 * what workflows, smart lists, and automations actually filter on, so the data
 * arrives usable rather than parked in a custom field nobody has wired up.
 *
 * Set GHL_CUSTOM_FIELDS to a JSON object mapping our keys to field ids when you
 * want them in custom fields as well:
 *   {"role":"abc123","company_size":"def456"}
 */

const API = 'https://services.leadconnectorhq.com/contacts/upsert'

// The API is versioned by header, not by URL. Pinned deliberately: an
// unpinned version means their next release changes our payload shape.
const API_VERSION = '2021-07-28'

export type CrmContact = {
  email: string
  fullName: string
  agencyName: string | null
  role: string | null
  companySize: string | null
  country: string | null
  subaccountCount: string | null
  marketingOptIn: boolean
  helpCenterSlug: string | null
  helpCenterUrl: string | null
  /** Caller-supplied tags beyond the survey set (e.g. admin provisioning). */
  extraTags?: string[]
}

export function isLeadConnectorConfigured(): boolean {
  return Boolean(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID)
}

/** Splits a single name field into the two the CRM insists on. */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return { firstName: fullName.trim(), lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

/**
 * Tags carry the survey.
 *
 * Prefixed so they group in the tag list and cannot collide with tags the team
 * already uses — an unprefixed "Agency owner" would merge with whatever else
 * happens to be called that.
 */
function tagsFor(contact: CrmContact): string[] {
  const tags = ['help-centre-signup']

  if (contact.role) tags.push(`role: ${contact.role}`)
  if (contact.companySize) tags.push(`size: ${contact.companySize}`)
  if (contact.country) tags.push(`country: ${contact.country}`)
  if (contact.subaccountCount) tags.push(`subaccounts: ${contact.subaccountCount}`)
  tags.push(contact.marketingOptIn ? 'marketing: opted in' : 'marketing: declined')
  if (contact.helpCenterSlug) tags.push('help-centre: live')
  if (contact.extraTags) tags.push(...contact.extraTags)

  return tags.map((tag) => tag.toLowerCase())
}

function customFieldsFor(contact: CrmContact): { id: string; value: string }[] {
  const raw = process.env.GHL_CUSTOM_FIELDS
  if (!raw) return []

  let mapping: Record<string, string>
  try {
    mapping = JSON.parse(raw) as Record<string, string>
  } catch {
    console.error('GHL_CUSTOM_FIELDS is not valid JSON; skipping custom fields')
    return []
  }

  const values: Record<string, string | null> = {
    role: contact.role,
    company_size: contact.companySize,
    country: contact.country,
    agency_name: contact.agencyName,
    subaccount_count: contact.subaccountCount,
    help_centre_url: contact.helpCenterUrl,
  }

  return Object.entries(mapping)
    .filter(([key]) => values[key])
    .map(([key, id]) => ({ id, value: values[key] as string }))
}

/**
 * Creates or updates the lead. Upsert, keyed on email within the location, so
 * calling it twice for one signup (once when the survey completes, again when
 * the centre goes live) updates rather than duplicates.
 *
 * Throws on failure. The caller decides whether that is fatal — for the signup
 * funnel it never is.
 */
export async function upsertLead(contact: CrmContact): Promise<void> {
  const token = process.env.GHL_API_TOKEN
  const locationId = process.env.GHL_LOCATION_ID
  if (!token || !locationId) throw new Error('GHL_API_TOKEN or GHL_LOCATION_ID is not set')

  const { firstName, lastName } = splitName(contact.fullName)

  const response = await fetch(API, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      version: API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      locationId,
      email: contact.email,
      firstName,
      lastName,
      name: contact.fullName,
      companyName: contact.agencyName ?? undefined,
      source: 'Help centre signup',
      tags: tagsFor(contact),
      customFields: customFieldsFor(contact),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`LeadConnector returned ${response.status}: ${detail.slice(0, 300)}`)
  }
}
