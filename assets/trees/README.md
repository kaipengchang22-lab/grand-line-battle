# Coastal tree assets

The procedural tree generator, presets, and leaf atlases are adapted from
@dgreenheck/ez-tree 1.1.0 by Daniel Greenheck:
https://github.com/dgreenheck/ez-tree

The upstream MIT license is retained in ez-tree/LICENSE. The generator is
vendored locally so the game does not download a large package at runtime.
It is adapted to use the existing Three.js version and local shared PBR maps.

The oak bark maps come from Poly Haven's Bark Brown 02:
https://polyhaven.com/a/bark_brown_02

The pine bark maps come from TextureCan:
https://www.texturecan.com/details/588/

Both bark texture sources are CC0. Only the 1K maps needed by the game are
included. Leaf atlases are the compact oak, ash, and pine assets distributed
with the EZ-Tree package.
