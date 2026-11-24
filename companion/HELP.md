# CasparCG Client

Controls CasparCG Client: rundown entries, playlists, takes between channels, and any layer.

## Setup

This module needs **CasparCG Client 1.1.0 or later** and Companion 5.0 or later.

1. In CasparCG Client open **Settings > Web Interface** and turn the web interface on.
2. If Companion runs on another computer, also turn on **Allow other devices**.
3. Enter these in the module's settings:

| Setting     | What to enter                                                                          |
| ----------- | -------------------------------------------------------------------------------------- |
| Address     | The computer running CasparCG Client. `127.0.0.1` when it is the same one as Companion |
| Port        | The port in Settings > Web Interface, usually `8126`                                   |
| Access code | The access code in Settings > Web Interface                                            |

The connection is not encrypted, so use it on a network you trust.

## Rundown entries

Entries are found by their **remote ID**, or else by their **label**, in any rundown that is open in the client. If two entries have the same label, the first one is used. Give entries a remote ID to be sure of reaching the right one, and to be free to change the label later.

You can pick an entry from the list or type its remote ID or label. The list follows the open rundowns.

## Actions

| Action                          | What it does                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| Rundown: play, load, stop …     | Does to an entry what its buttons in the client do. Also for playlists, groups and takes         |
| Rundown: mark as used or unused | Sets the used mark on an entry                                                                   |
| Layer: play, pause, skip …      | Controls whatever is on a layer                                                                  |
| Take between channels           | Swaps two layers, as a cut or a fade, and can play the clip as it is taken                       |
| Clear layer, Clear channel      | Takes what is there off air                                                                      |
| Send a CasparCG command         | Sends any AMCP command to a server. The reply can be stored in a variable as the action's result |

How far _Back_ and _Forward_ skip is set in the client, under Settings > Playback.

## Feedbacks

| Feedback                             | Type    | What it shows                                                   |
| ------------------------------------ | ------- | --------------------------------------------------------------- |
| Rundown: entry is playing, loaded …  | Boolean | The state of an entry                                           |
| Rundown: entry is marked as used     | Boolean | The used mark                                                   |
| Rundown: time left on an entry       | Value   | For example `01:25`, or empty when it is not loaded or playing  |
| Layer: is playing, paused, empty …   | Boolean | The state of a layer                                            |
| Layer: a certain clip is on it       | Boolean | Whether a clip is on a layer, whatever put it there             |
| Layer: less than a certain time left | Boolean | For warning colours. Only while a clip plays that does not loop |
| Layer: clip name, time left …        | Value   | Clip name, state, times, next clip or playlist of a layer       |
| CasparCG server is connected         | Boolean | Whether the client is connected to its CasparCG server          |

## Variables

| Variable                                   | What it holds                                                |
| ------------------------------------------ | ------------------------------------------------------------ |
| `client_version`                           | Version of CasparCG Client                                   |
| `rundowns`                                 | Names of the open rundowns                                   |
| `servers`, `servers_connected`             | Number of CasparCG servers, and how many are connected       |
| `layer_1_10_state`                         | `playing`, `paused`, `loaded`, `ended` or `empty`            |
| `layer_1_10_name`, `_next`                 | Clip name and the clip after it                              |
| `layer_1_10_left`, `_elapsed`, `_duration` | Times, for example `01:25`                                   |
| `layer_1_10_playlist`, `_clip`             | Playlist on the layer and its place in it, for example `2/5` |
| `entry_ID_label`, `_state`, `_left`        | For every entry with a remote ID                             |

Layer variables are for the first server in the client's settings, and appear once something has been on the layer. In a remote ID, anything but letters, numbers, `-` and `_` becomes `_` in the variable's name. For other servers use the _Layer: clip name, time left …_ feedback.

## Presets

There are presets for takes from channel 2 to channel 1, for layer 10 of every channel, and for playing, loading and stopping every entry of the open rundowns.

## Troubleshooting

| Status                                   | What to do                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Wrong access code                        | Enter the code from Settings > Web Interface. Changing it there signs this module out |
| Nothing is listening there               | Start the client, turn on its web interface, and check the port                       |
| CasparCG Client 1.1.0 or later is needed | Update the client                                                                     |
| Cannot connect from another computer     | Turn on Allow other devices in the client, and let it through the firewall            |
| No open rundown has an entry called …    | Open the rundown in the client, or check the remote ID or label on the button         |
