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

Both bark texture sources are CC0. AO, normal, and roughness maps are kept at
1K; the bark color maps are converted to 512-pixel WebP. The transparent leaf
atlases are WebP at 384–512 pixels and remain distributed with the EZ-Tree
package.
