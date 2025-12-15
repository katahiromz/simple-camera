#!/bin/bash
mkdir -p android/app/src/main/assets/camera
rm -fr android/app/src/main/assets/camera/*
cp -r dist/* android/app/src/main/assets/camera/
