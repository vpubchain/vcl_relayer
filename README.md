Relayer - Light Weight Node.js app for Relaying Syscoin and Geth
================================================================

This app subscribes "newBlockHeaders" and "sync" from Go-Ethereum
via web3.js.  Then it pushes the data to syscoin via RPC through
`syscoinsetethheaders` and `syscoinsetethstatus`

Requirement
-----------
This repository currently requires node v12 and pkg >= 4.4.1

How to Build
------------
`git clone https://www.github.com/syscoin/relayer`

`npm install`

`npm install pkg -g`

`pkg package.json`

This will produce portable binaries to be used in other systems.


How to Use
----------

`relayer -sysrpcuser [username] -sysrpcpw [password] -sysrpcport [port] -ethwsport [port] -gethtestnet [0/1]`
