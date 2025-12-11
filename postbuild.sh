#!/bin/bash
mkdir -p android/app/src/main/assets/simple_camera
rm -fr android/app/src/main/assets/simple_camera/*
cp -r dist/* android/app/src/main/assets/simple_camera/
