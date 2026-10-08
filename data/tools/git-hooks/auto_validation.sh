#!/bin/bash

WORKSPACE=.

LUBAN_DLL=$WORKSPACE/tools/Luban3.14/Luban.dll
CONF_ROOT=$WORKSPACE/tools

dotnet $LUBAN_DLL \
    -t all \
	-f \
    --conf $CONF_ROOT/luban.conf