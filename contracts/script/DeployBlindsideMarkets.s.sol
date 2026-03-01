// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BinaryPriceMarket} from "../src/BinaryPriceMarket.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
    function serializeAddress(
        string calldata objectKey,
        string calldata valueKey,
        address value
    ) external returns (string memory json);
    function serializeUint(
        string calldata objectKey,
        string calldata valueKey,
        uint256 value
    ) external returns (string memory json);
    function writeJson(string calldata json, string calldata path) external;
    function projectRoot() external view returns (string memory);
}

contract DeployBlindsideMarketsScript {
    Vm private constant VM =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant PYTH_PRIMARY =
        0x2880aB155794e7179c9eE2e38200202908C17B43;
    address private constant PYTH_BETA =
        0xad2B52D2af1a9bD5c561894Cdd84f7505e1CD0B5;
    uint64 private constant CUTOFF_TIME = 1_774_972_800;

    function run()
        external
        returns (
            BinaryPriceMarket btc,
            BinaryPriceMarket eth,
            BinaryPriceMarket sol,
            BinaryPriceMarket mon
        )
    {
        VM.startBroadcast();

        btc = new BinaryPriceMarket(
            "Will BTC/USD settle above $95,000 at 2026-03-31 16:00 UTC?",
            9_500_000_000_000,
            CUTOFF_TIME,
            PYTH_PRIMARY,
            0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43
        );

        eth = new BinaryPriceMarket(
            "Will ETH/USD settle above $2,700 at 2026-03-31 16:00 UTC?",
            270_000_000_000,
            CUTOFF_TIME,
            PYTH_PRIMARY,
            0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace
        );

        sol = new BinaryPriceMarket(
            "Will SOL/USD settle above $180 at 2026-03-31 16:00 UTC?",
            18_000_000_000,
            CUTOFF_TIME,
            PYTH_PRIMARY,
            0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d
        );

        mon = new BinaryPriceMarket(
            "Will MON/USD settle above $0.0210 at 2026-03-31 16:00 UTC?",
            2_100_000,
            CUTOFF_TIME,
            PYTH_BETA,
            0xe786153cc54abd4b0e53b4c246d54d9f8eb3f3b5a34d4fc5a2e9a423b0ba5d6b
        );

        VM.stopBroadcast();

        string memory deploymentKey = "trackedMarkets";
        VM.serializeAddress(deploymentKey, "btc", address(btc));
        VM.serializeAddress(deploymentKey, "eth", address(eth));
        VM.serializeAddress(deploymentKey, "sol", address(sol));
        VM.serializeAddress(deploymentKey, "mon", address(mon));
        string memory json = VM.serializeUint(
            deploymentKey,
            "cutoffTime",
            CUTOFF_TIME
        );

        VM.writeJson(
            json,
            string.concat(
                VM.projectRoot(),
                "/deployments/tracked-markets.json"
            )
        );
    }
}
