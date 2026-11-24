import type { SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
}

export type ModuleSecrets = {
	code: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				"Needs CasparCG Advanced Client 1.1.0 or later, which is not the original CasparCG Client (2.x). The port and access code are in its Settings, under Web Interface. If Companion runs on another computer, turn on 'Allow other devices' there too.",
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Address',
			description: 'IP address or name of the computer running CasparCG Advanced Client',
			width: 8,
			default: '127.0.0.1',
			minLength: 1,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 8126,
		},
		{
			type: 'secret-text',
			id: 'code',
			label: 'Access code',
			width: 8,
			minLength: 6,
		},
	]
}
