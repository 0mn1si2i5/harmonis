#!/bin/bash
# Build redistributable, audio-only LGPL FFmpeg tools from unmodified sources.
set -euo pipefail
cd "$(dirname "$0")/.."
root="$PWD"
arch="$(uname -m)"
case "$arch" in arm64) target=arm64 ;; x86_64) target=x64 ;; *) echo 'Unsupported build architecture' >&2; exit 1 ;; esac
work="${HARMONIS_MEDIA_WORK:-/tmp/harmonis-media-$target}"
prefix="$work/prefix"
output="$root/vendor/darwin-$target"
mkdir -p "$work/sources" "$prefix" "$output/licenses"
fetch() { if [ ! -s "$2" ]; then curl --fail --location --retry 3 "$1" -o "$2"; fi; }
fetch https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz "$work/sources/ffmpeg-9.0.2.tar.xz"
fetch https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz "$work/sources/lame-3.100.tar.gz"
# Published source digests are recorded after the first verified download.
if [ -f scripts/media-sources.sha256 ]; then (cd "$work/sources" && shasum -a 256 -c "$root/scripts/media-sources.sha256"); fi
[ -d "$work/lame-3.100" ] || tar -xzf "$work/sources/lame-3.100.tar.gz" -C "$work"
[ -d "$work/ffmpeg-9.0.2" ] || tar -xf "$work/sources/ffmpeg-9.0.2.tar.xz" -C "$work"
export MACOSX_DEPLOYMENT_TARGET=12.0
jobs="$(sysctl -n hw.logicalcpu)"
(
  cd "$work/lame-3.100"
  ./configure --prefix="$prefix" --disable-shared --enable-static --disable-frontend --disable-decoder --disable-nasm
  make -j "$jobs"
  make install
) > "$work/lame-build.log" 2>&1
(
  cd "$work/ffmpeg-9.0.2"
  ./configure --prefix="$prefix" --cc=clang --disable-autodetect --disable-gpl --disable-nonfree \
    --disable-doc --disable-debug --disable-network --disable-x86asm --disable-everything \
    --disable-shared --enable-static --enable-avdevice \
    --enable-ffmpeg --enable-ffprobe --enable-libmp3lame \
    --extra-cflags="-I$prefix/include -mmacosx-version-min=12.0" \
    --extra-ldflags="-L$prefix/lib -mmacosx-version-min=12.0" \
    --enable-protocol=file,pipe \
    --enable-demuxer=mov,mp3,wav,matroska,ogg,flac,aac,concat \
    --enable-decoder=aac,mp3,mp3float,opus,vorbis,flac,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_f64le,pcm_s16be \
    --enable-encoder=pcm_s16le,pcm_s24le,pcm_f32le,libmp3lame,opus \
    --enable-muxer=wav,mp3,null,pcm_s16le,f32le,webm \
    --enable-parser=aac,mpegaudio,opus,vorbis,flac \
    --enable-indev=lavfi \
    --enable-filter=aresample,asetpts,atrim,concat,loudnorm,silencedetect,astats,ebur128,aformat,anull,volume,amix,adelay,apad,asplit,pan,channelsplit,afade,alimiter,sine,aevalsrc,anullsrc
  make -j "$jobs"
) > "$work/ffmpeg-build.log" 2>&1
cp "$work/ffmpeg-9.0.2/ffmpeg" "$work/ffmpeg-9.0.2/ffprobe" "$output/"
strip "$output/ffmpeg" "$output/ffprobe"
cp "$work/ffmpeg-9.0.2/COPYING.LGPLv2.1" "$output/licenses/FFmpeg-LGPL-2.1.txt"
cp "$work/lame-3.100/COPYING" "$output/licenses/LAME-LGPL-2.txt"
"$output/ffmpeg" -buildconf > "$output/build-configuration.txt" 2>&1
(cd "$work/sources" && shasum -a 256 *.tar.*) > "$output/source-checksums.txt"
cp scripts/build-media.sh scripts/media-sources.sha256 "$work/sources/"
cp docs/development.md "$work/sources/BUILD.md"
cp "$output/build-configuration.txt" "$work/sources/"
mkdir -p release
COPYFILE_DISABLE=1 tar -czf "release/media-sources-darwin-$target.tar.gz" -C "$work" sources
printf 'Built %s\n' "$output"
