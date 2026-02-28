// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BinaryPriceMarket} from "../src/BinaryPriceMarket.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployBinaryPriceMarketScript {
    Vm private constant VM =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (BinaryPriceMarket market) {
        VM.startBroadcast();

        market = new BinaryPriceMarket(
            "Will MON/USD settle above $0.0210 at 2026-03-31 16:00 UTC?",
            2_100_000,
            1_774_972_800,
            0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5,
            0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b
        );

        VM.stopBroadcast();
    }
}
