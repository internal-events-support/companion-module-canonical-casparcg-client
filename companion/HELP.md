# Canonical: CasparCG Client

Controls Canonical's CasparCG Client: rundown entries, playlists, takes between channels, and any layer.

This is **not** for the original CasparCG Client (version 2.x), and not for a CasparCG server directly.

## Setup

This module needs **Canonical's CasparCG Client 1.1.0 or later** and Companion 5.0 or later. The client comes from Canonical's internal events team.

1. In the client open **Settings > Web Interface** and turn the web interface on.
2. If Companion runs on another computer, also turn on **Allow other devices**.
3. Enter these in the module's settings:

| Setting     | What to enter                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Address     | The computer running the client, without `http://`. `127.0.0.1` when it is the same one as Companion |
| Port        | The port in Settings > Web Interface, usually `8126`                                                 |
| Access code | The access code in Settings > Web Interface                                                          |

The connection is not encrypted, so use it on a network you trust.

## Rundown entries

You can pick an entry from the list, or type its remote ID or label. The list follows the rundowns that are open in the client.

An entry is looked for by its **remote ID** first, and then by its **label**. If several have the same label, one without a remote ID goes first, and otherwise the first in the rundown. Only entries that can be reached this way are in the list. Give entries a remote ID to be sure of the right one, and to be free to change the label later.

Every entry can be used, whether or not "Allow remote" is on for it in the client. Playout Command entries are left out: they press a button on the screen that plays them, so they would do nothing from Companion.

## Actions

| Action                             | What it does                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rundown: play, load, stop …        | Does to an entry what its buttons in the client do. Also for playlists, groups and takes                                                                                                           |
| Rundown: mark as used or unused    | Sets, removes or toggles the used mark of an entry, together with what is in it                                                                                                                    |
| Rundown: mark everything as unused | Removes the used mark of every entry of every open rundown                                                                                                                                         |
| Layer: play, pause, skip …         | Controls whatever is on a layer                                                                                                                                                                    |
| Take between channels              | Swaps two layers, as a cut or a fade over a number of frames. Can play the clip as it is taken, and pauses the one that comes off unless that is turned off. A take from an empty layer is refused |
| Clear layer                        | Takes what is on a layer off air                                                                                                                                                                   |
| Clear channel                      | Takes everything on a channel off air, and resets its mixer settings. Both clears also stop a playlist that is there                                                                               |
| Channel: playback overlay          | Shows or hides the time left on clips on a channel. It is set up in the client, under Channels. Needs client 1.2.0 or later                                                                        |
| Send a CasparCG command            | Sends any AMCP command to a server. The reply is the action's result                                                                                                                               |

How far _Back_ and _Forward_ skip is set in the client, under Settings > Playback.

Where an action or feedback asks for a **CasparCG server**, leave it at _First server_ to use the first one in the client's settings.

**Channels** are listed by number, with the names they have been given in the client under Channels (client 1.2.0 or later). An expression can give either the number or the name.

## Feedbacks

| Feedback                             | Type    | What it shows                                                                                                               |
| ------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| Rundown: entry is playing, loaded …  | Boolean | The state of an entry. A group shows the state of what is in it                                                             |
| Rundown: entry is marked as used     | Boolean | The used mark                                                                                                               |
| Rundown: label of an entry           | Value   | The label, for buttons that choose an entry by its remote ID                                                                |
| Rundown: time left on an entry       | Value   | For example `01:25`. For videos, audio and playlists that are on a layer, otherwise empty                                   |
| Layer: is playing, paused, empty …   | Boolean | The state of a layer. Only videos and audio can be loaded or ended; anything else is playing or paused                      |
| Layer: a certain clip is on it       | Boolean | Whether a video or audio clip is on a layer, whatever put it there                                                          |
| Layer: less than a certain time left | Boolean | For warning colours. Only while a clip plays that does not loop                                                             |
| Layer: clip name, time left …        | Value   | Clip name, channel number and name, state, times, time left in seconds, next clip, playlist, or clip number in the playlist |
| Channel: playback overlay is showing | Boolean | Whether the overlay of a channel is turned on and has not been cleared                                                      |
| CasparCG server is connected         | Boolean | Whether the client is connected to its CasparCG server                                                                      |

Takes, mixer entries and commands happen at once, so they are never shown as playing.

When the connection to the client is lost, nothing is shown as playing or loaded until it is back.

## Variables

| Variable                                            | What it holds                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------- |
| `client_version`                                    | Version of the client                                                   |
| `rundowns`                                          | Names of the open rundowns                                              |
| `servers`, `servers_connected`                      | Number of CasparCG servers, and how many are connected                  |
| `channel_1_name`                                    | Name of the channel, for every channel of the first server              |
| `layer_1_10_state`                                  | `playing`, `paused`, `loaded`, `ended` or `empty`                       |
| `layer_1_10_name`, `layer_1_10_next`                | Clip name, and the clip after it                                        |
| `layer_1_10_left`                                   | Time left, for example `01:25`                                          |
| `layer_1_10_seconds`                                | Time left in seconds, as a number. Empty for something without a length |
| `layer_1_10_elapsed`, `layer_1_10_duration`         | Time played, and length                                                 |
| `layer_1_10_playlist`, `layer_1_10_clip`            | Playlist on the layer, and the clip number in it, for example `2/5`     |
| `entry_ID_label`, `entry_ID_state`, `entry_ID_left` | For every entry with a remote ID, with that in place of `ID`            |

Layer variables are for the first server in the client's settings, and appear once something has been on the layer. For other servers use the _Layer: clip name, time left …_ feedback.

In the name of an entry's variables, anything in the remote ID but letters, numbers, `-` and `_` becomes `_`. If that makes two the same, the second gets `_2`, the third `_3`, and so on.

## Presets

- **Takes:** cut or fade between two channels. Set the channels and the layer in the local variables of the button.
- **Each layer in use:** clip and time left, and the transport buttons, for the channels that use it on the first server. With no layer in use it is layer 10 of every channel. The channel and layer are local variables of the button.
- **Playback overlays:** show or hide the overlay of each channel.
- **Each open rundown:** Play and Stop for every entry in the list, and Load for those that can be loaded.

## Troubleshooting

These are shown as the status of the connection:

| Status                                                          | What to do                                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Enter the address and port of CasparCG Client                   | Fill in the settings                                                                                     |
| Enter only the address, without http:// or a port               | Put the port in its own setting                                                                          |
| Enter the access code                                           | Fill in the access code                                                                                  |
| Wrong access code                                               | Enter the code from Settings > Web Interface. The module does not try again until the settings are saved |
| Too many wrong access codes. Trying again soon                  | Wait a minute                                                                                            |
| Nothing is listening there. Is the web interface on?            | Start the client, turn on its web interface, and check the port                                          |
| That address was not found                                      | Check the address                                                                                        |
| This does not answer like CasparCG Client                       | Something else is using that port. Check the address and port                                            |
| Canonical's CasparCG Client 1.1.0 or later is needed            | Update the client                                                                                        |
| CasparCG Client stopped answering, or The connection was closed | The client was closed or the network dropped. The module keeps trying                                    |

Other things:

- **It cannot connect from another computer:** turn on Allow other devices in the client, and let it through that computer's firewall.
- **The log says no open rundown has an entry called …:** open the rundown in the client, or check the remote ID or label on the button.
- **The log says there is no channel called …:** check the number, or the name in the client under Channels.
- **The log says it is not connected:** the action was pressed while the connection was down, so nothing was sent.
