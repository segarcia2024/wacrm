import type { ToolDefinition } from './types'

export const SEARCH_VEHICLES = 'search_vehicles'
export const GET_VEHICLE = 'get_vehicle'
export const CHECK_APPOINTMENT_SLOT = 'check_appointment_slot'
export const CREATE_APPOINTMENT = 'create_appointment'
export const LIST_CONTACT_APPOINTMENTS = 'list_contact_appointments'

const VEHICLE_STATUS_ENUM = ['available', 'reserved', 'sold', 'all'] as const
const APPOINTMENT_TYPE_ENUM = [
  'showroom',
  'test_drive',
  'call',
  'delivery',
  'other',
] as const

/**
 * CRM tools the WhatsApp assistant can call. Shared schema; each
 * provider adapter maps this into its own `tools` payload.
 */
export const CRM_TOOLS: ToolDefinition[] = [
  {
    name: SEARCH_VEHICLES,
    description:
      'Search the dealership live vehicle inventory. Use this for ANY question about cars in stock, prices, makes, models, years, or availability. Defaults to currently available vehicles. Quote prices exactly as returned (Colombian pesos). Never invent a vehicle or a price.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description:
            'Free-text search: make, model, plate, or year (e.g. "mazda 3", "corolla 2020", "ABC123").',
        },
        make: { type: 'string', description: 'Filter by make (partial match).' },
        model: { type: 'string', description: 'Filter by model (partial match).' },
        year: { type: 'integer', description: 'Exact model year.' },
        min_year: { type: 'integer', description: 'Minimum model year (inclusive).' },
        max_price: {
          type: 'integer',
          description: 'Maximum list price in whole COP (no decimals).',
        },
        status: {
          type: 'string',
          enum: [...VEHICLE_STATUS_ENUM],
          description:
            'Stock status. Default "available". Use "all" only if the customer asks about a reserved/sold car.',
        },
        limit: {
          type: 'integer',
          description: 'Max rows to return (1–15). Default 8.',
        },
      },
    },
  },
  {
    name: GET_VEHICLE,
    description:
      'Look up one vehicle by its id (from search_vehicles). Returns live price and status.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['vehicle_id'],
      properties: {
        vehicle_id: {
          type: 'string',
          description: 'Vehicle UUID from search_vehicles.',
        },
      },
    },
  },
  {
    name: CHECK_APPOINTMENT_SLOT,
    description:
      'Check whether a date/time is free for this customer before booking. Times are America/Bogota (UTC-5). Call this before create_appointment.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['starts_at'],
      properties: {
        starts_at: {
          type: 'string',
          description:
            'Proposed start. Prefer "YYYY-MM-DD HH:mm" in America/Bogota (e.g. "2026-09-05 15:00").',
        },
        duration_minutes: {
          type: 'integer',
          description: 'Length in minutes (15–240). Default 60.',
        },
      },
    },
  },
  {
    name: CREATE_APPOINTMENT,
    description:
      'Book an appointment on the dealership calendar for this WhatsApp customer. ONLY call after the customer has confirmed a specific date and time, and preferably after check_appointment_slot returned available. On success the appointment appears in the Revio agenda automatically. Never claim a booking succeeded unless this tool returns ok:true.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['starts_at'],
      properties: {
        starts_at: {
          type: 'string',
          description:
            'Confirmed start. Prefer "YYYY-MM-DD HH:mm" in America/Bogota.',
        },
        type: {
          type: 'string',
          enum: [...APPOINTMENT_TYPE_ENUM],
          description:
            'showroom visit, test_drive, call, delivery, or other. Default showroom.',
        },
        duration_minutes: {
          type: 'integer',
          description: 'Length in minutes (15–240). Default 60.',
        },
        location: {
          type: 'string',
          description: 'Optional location / branch name.',
        },
        notes: {
          type: 'string',
          description: 'Short internal note (vehicle of interest, customer request).',
        },
        vehicle_id: {
          type: 'string',
          description: 'Optional inventory vehicle this visit is about.',
        },
      },
    },
  },
  {
    name: LIST_CONTACT_APPOINTMENTS,
    description:
      'List this customer upcoming scheduled appointments (so you do not double-book and can remind them of an existing visit).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
]
